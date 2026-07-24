// chat-assistente — Fase 5 (ESPERTO DI FINANZA), blocco 1: assistente conversazionale
// su Claude, con contesto limitato ad AGGREGATI (mai il dettaglio riga per riga di
// movimenti/buste paga/bollette) — scelta esplicita dell'utente. JWT-protected.
//
// Mai raccomandazioni di investimento specifiche (fuori dal perimetro della
// consulenza regolata): solo descrizione fattuale dei dati e, se richiesto, scenari
// ipotetici con ipotesi dichiarate esplicitamente.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

const MODELLO = "claude-haiku-4-5";
const MAX_LUNGHEZZA_MSG = 1500;
const MAX_HISTORY = 20;
const MAX_TOKENS_RISPOSTA = 1024;
const BUDGET_INTESTATARIO_ID = "37af7f90-79d8-42e6-b172-367ccbd38846";

const SYSTEM_PROMPT = `Sei l'assistente finanziario personale integrato in BUDGETING, l'app di gestione finanziaria personale dell'utente. Rispondi sempre in italiano, tono diretto e conciso (massimo 150 parole salvo reale necessità).

## REGOLE ASSOLUTE — non derogabili
1. NON fornisci MAI raccomandazioni di investimento specifiche: niente consigli su cosa comprare/vendere/tenere, niente giudizi di merito su singoli strumenti, niente previsioni di mercato certe.
2. Puoi DESCRIVERE e COMMENTARE in modo fattuale i dati forniti nel contesto (patrimonio, sostenibilità dei costi fissi, imposte) e calcolare scenari ipotetici se richiesto esplicitamente, sempre etichettando le ipotesi come tali (mai come previsioni certe).
3. Non inventare dati: se un'informazione non è nel contesto fornito, dillo esplicitamente.
4. Se l'utente chiede una raccomandazione di investimento specifica, rifiuta con gentilezza e spiega che resta fuori dal perimetro di questo strumento (che è di reporting/simulazione, non consulenza).
5. Concludi le risposte che toccano decisioni finanziarie con un breve promemoria che non sostituiscono una consulenza professionale abilitata.`;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const fmtEur = (n: number) => "€" + n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function costruisciContesto(admin: ReturnType<typeof createAdminClient>, userId: string, authHeader: string): Promise<string> {
  const [navQ, eventiQ, budgetRes] = await Promise.all([
    admin.from("conto_nav_giornaliero")
      .select("report_date, cash_eur, stock_eur, bonds_eur, options_eur, funds_eur, commodities_eur, crypto_eur, total_eur")
      .eq("user_id", userId).order("report_date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("tax_events").select("anno, imposta_eur").eq("user_id", userId),
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/calcola-budget-sostenibilita`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ intestatario_id: BUDGET_INTESTATARIO_ID }),
    }).then((r) => r.json()).catch(() => null),
  ]);

  let sezionePortafoglio = "Nessuno snapshot patrimonio disponibile.";
  const nav = navQ.data;
  if (nav) {
    const categorie = [
      ["Azionario", nav.stock_eur], ["Obbligazionario", nav.bonds_eur], ["Liquidità", nav.cash_eur],
      ["Fondi/ETF misti", nav.funds_eur], ["Materie prime", nav.commodities_eur], ["Crypto", nav.crypto_eur], ["Opzioni", nav.options_eur],
    ].filter(([, v]) => Number(v) !== 0).map(([nome, v]) => `${nome} ${fmtEur(Number(v))}`).join(", ");
    sezionePortafoglio = `Valore totale patrimonio investito: ${fmtEur(Number(nav.total_eur))} (snapshot ${nav.report_date}). Composizione: ${categorie}.`;
  }

  let sezioneFiscale = "Nessun evento fiscale calcolato.";
  const eventi = eventiQ.data ?? [];
  if (eventi.length > 0) {
    const perAnno = new Map<number, number>();
    for (const e of eventi) perAnno.set(e.anno, (perAnno.get(e.anno) ?? 0) + Number(e.imposta_eur));
    sezioneFiscale = [...perAnno.entries()].sort((a, b) => b[0] - a[0]).slice(0, 3)
      .map(([anno, imposta]) => `${anno}: imposta totale ${fmtEur(imposta)}`).join("; ");
  }

  let sezioneBudget = "Analisi di sostenibilità non disponibile.";
  const r = budgetRes?.risultato;
  if (r) {
    sezioneBudget = `Costi fissi mensili ${fmtEur(r.costiFissiMensiliTotali)}, reddito ricorrente mensile ${fmtEur(r.redditoRicorrenteMensile)} → rapporto ${r.rapportoPct.toFixed(1)}% (giudizio: ${r.giudizio}). Margine mensile ${fmtEur(r.margineMensile)}. Fondo emergenza target ${fmtEur(r.fondoEmergenzaTargetMinEur)}–${fmtEur(r.fondoEmergenzaTargetMaxEur)}.`;
  }

  return `## DATI DELL'UTENTE (solo aggregati — usali in modo descrittivo, mai per dare consigli)
PATRIMONIO: ${sezionePortafoglio}
FISCALE (imposta totale per anno, ultimi 3 anni con eventi): ${sezioneFiscale}
SOSTENIBILITÀ COSTI FISSI (Fase 4 BUDGET): ${sezioneBudget}
Data odierna: ${new Date().toISOString().slice(0, 10)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Authorization mancante" });

    const admin = createAdminClient();
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json(401, { error: "Token non valido" });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const messaggio: string | undefined = body?.messaggio;
    const conversazioneId: string | undefined = body?.conversazione_id;
    if (!messaggio || typeof messaggio !== "string" || !messaggio.trim()) {
      return json(400, { error: "Messaggio vuoto" });
    }
    if (messaggio.length > MAX_LUNGHEZZA_MSG) {
      return json(400, { error: `Il messaggio supera i ${MAX_LUNGHEZZA_MSG} caratteri.` });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY non configurata");
      return json(500, { error: "L'assistente non è ancora configurato (manca ANTHROPIC_API_KEY)." });
    }

    let convId: string | null = null;
    if (conversazioneId) {
      const { data: conv } = await admin.from("chat_conversazioni").select("id").eq("id", conversazioneId).eq("user_id", userId).single();
      if (conv) convId = conv.id;
    }
    if (!convId) {
      const { data: nuova, error: convErr } = await admin.from("chat_conversazioni")
        .insert({ user_id: userId, titolo: messaggio.slice(0, 80) }).select("id").single();
      if (convErr || !nuova) return json(500, { error: `Errore creazione conversazione: ${convErr?.message}` });
      convId = nuova.id;
    }

    const { data: histRows } = await admin.from("chat_messaggi")
      .select("ruolo, contenuto").eq("conversazione_id", convId).order("created_at", { ascending: false }).limit(MAX_HISTORY);
    const history = (histRows ?? []).reverse().map((m) => ({ role: m.ruolo, content: m.contenuto }));

    const contesto = await costruisciContesto(admin, userId, authHeader);

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELLO,
        max_tokens: MAX_TOKENS_RISPOSTA,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: contesto },
        ],
        messages: [...history, { role: "user", content: messaggio }],
      }),
    });

    if (aiRes.status === 429 || aiRes.status === 529) {
      return json(503, { error: "L'assistente è momentaneamente occupato. Riprova tra qualche istante." });
    }
    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}));
      console.error("Anthropic error", aiRes.status, JSON.stringify(err));
      return json(502, { error: "Errore nella chiamata all'assistente. Riprova più tardi." });
    }

    const data = await aiRes.json();
    const risposta = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");

    const { error: insErr } = await admin.from("chat_messaggi").insert([
      { user_id: userId, conversazione_id: convId, ruolo: "user", contenuto: messaggio },
      {
        user_id: userId, conversazione_id: convId, ruolo: "assistant", contenuto: risposta,
        modello: data.model ?? MODELLO, input_tokens: data.usage?.input_tokens ?? null, output_tokens: data.usage?.output_tokens ?? null,
      },
    ]);
    if (insErr) console.error("Errore salvataggio messaggi:", insErr.message);
    await admin.from("chat_conversazioni").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    return json(200, { risposta, conversazione_id: convId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

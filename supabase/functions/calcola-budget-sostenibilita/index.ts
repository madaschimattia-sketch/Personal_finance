// calcola-budget-sostenibilita — Rapporto costi fissi (utenze_bollette) vs reddito
// ricorrente (introiti_buste_paga), giudizio di sostenibilità e allocazione
// suggerita del margine (fondo emergenza + risparmio/investimento). Strumento di
// REPORTING puro: non scrive nulla, nessuna sicurezza anni già dichiarati (non è
// un quadro fiscale). JWT-protected, per utente.
//
// Mai raccomandazioni di prodotto specifico (fuori dal perimetro della consulenza
// regolata) — solo percentuali/importi su fondo emergenza e margine libero.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaSostenibilita, type BollettaInput, type BustaPagaInput, type ParametriSostenibilita } from "../_shared/budget-sostenibilita.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const intestatarioId: string | undefined = body?.intestatario_id;

    // .in() non intercetta mai le righe NULL (semantica SQL: IN non matcha mai NULL,
    // nemmeno passando null nell'array) — serve .or()/.is() per prendere sia
    // l'eventuale override per intestatario sia il default globale (intestatario_id
    // IS NULL). Bug reale corretto qui: prima faceva sempre 500 "Parametro mancante".
    let parametriQuery = admin.from("config_budget_parametri").select("chiave, valore, intestatario_id").eq("user_id", userId);
    parametriQuery = intestatarioId
      ? parametriQuery.or(`intestatario_id.eq.${intestatarioId},intestatario_id.is.null`)
      : parametriQuery.is("intestatario_id", null);
    const { data: parametriRows, error: parErr } = await parametriQuery;
    if (parErr) return json(500, { error: `Lettura config_budget_parametri fallita: ${parErr.message}` });
    // Se esiste un override per l'intestatario, prevale sul default (intestatario_id null).
    const paramByChiave = new Map<string, number>();
    for (const p of (parametriRows ?? []).sort((a, b) => (a.intestatario_id === null ? -1 : 1))) {
      paramByChiave.set(p.chiave as string, Number(p.valore));
    }
    const requiredKeys = ["soglia_sostenibile_pct", "soglia_attenzione_pct", "target_mesi_fondo_emergenza_min", "target_mesi_fondo_emergenza_max"];
    for (const k of requiredKeys) {
      if (!paramByChiave.has(k)) return json(500, { error: `Parametro budget mancante in config_budget_parametri: ${k}` });
    }
    const parametri: ParametriSostenibilita = {
      sogliaSostenibilePct: paramByChiave.get("soglia_sostenibile_pct")!,
      sogliaAttenzionePct: paramByChiave.get("soglia_attenzione_pct")!,
      targetMesiFondoEmergenzaMin: paramByChiave.get("target_mesi_fondo_emergenza_min")!,
      targetMesiFondoEmergenzaMax: paramByChiave.get("target_mesi_fondo_emergenza_max")!,
    };

    const { data: bollette, error: bollErr } = await admin
      .from("utenze_bollette")
      .select("categoria, importo, frequenza, domicilio_id")
      .eq("user_id", userId);
    if (bollErr) return json(500, { error: `Lettura utenze_bollette fallita: ${bollErr.message}` });

    let busteQuery = admin.from("introiti_buste_paga").select("periodo_da, netto").eq("user_id", userId);
    if (intestatarioId) busteQuery = busteQuery.eq("intestatario_id", intestatarioId);
    const { data: bustePaga, error: busteErr } = await busteQuery;
    if (busteErr) return json(500, { error: `Lettura introiti_buste_paga fallita: ${busteErr.message}` });

    if (!bustePaga || bustePaga.length === 0) {
      return json(200, { error: null, nota: "Nessuna busta paga disponibile: impossibile calcolare la sostenibilità.", risultato: null });
    }

    // Le utenze sono per domicilio (costo intero della casa): se l'intestatario è
    // cointestatario, la sua quota_percentuale in domicilio_intestatari scala il
    // costo alla sua parte, così si confronta con il SUO reddito, non con l'intero
    // costo condiviso. Senza intestatario_id (vista whole-household) non si scala.
    let quotaByDomicilio = new Map<string, number>();
    if (intestatarioId) {
      const { data: quote, error: quoteErr } = await admin
        .from("domicilio_intestatari")
        .select("domicilio_id, quota_percentuale")
        .eq("user_id", userId)
        .eq("intestatario_id", intestatarioId);
      if (quoteErr) return json(500, { error: `Lettura domicilio_intestatari fallita: ${quoteErr.message}` });
      quotaByDomicilio = new Map((quote ?? []).map((q) => [q.domicilio_id as string, Number(q.quota_percentuale)]));
    }

    const bolletteInput: BollettaInput[] = (bollette ?? []).map((b) => {
      const quotaPct = intestatarioId ? (quotaByDomicilio.get(b.domicilio_id as string) ?? 100) : 100;
      return {
        categoria: b.categoria as string,
        importo: Number(b.importo) * (quotaPct / 100),
        frequenza: b.frequenza as string | null,
      };
    });

    // Spese fisse manuali (subscription, auto, assicurazioni, banca): personali
    // dell'intestatario, nessuna quota da applicare (già il suo costo per intero).
    // Solo le righe attive contribuiscono al calcolo ricorrente.
    let speseQuery = admin.from("spese_fisse_manuali").select("categoria, importo, frequenza").eq("user_id", userId).eq("attivo", true);
    if (intestatarioId) speseQuery = speseQuery.eq("intestatario_id", intestatarioId);
    const { data: speseFisse, error: speseErr } = await speseQuery;
    if (speseErr) return json(500, { error: `Lettura spese_fisse_manuali fallita: ${speseErr.message}` });
    for (const s of speseFisse ?? []) {
      bolletteInput.push({
        categoria: s.categoria as string,
        importo: Number(s.importo),
        frequenza: s.frequenza as string,
      });
    }

    const bustePagaInput: BustaPagaInput[] = bustePaga.map((b) => ({
      periodoDa: b.periodo_da as string,
      netto: Number(b.netto),
    }));

    const risultato = calcolaSostenibilita(bolletteInput, bustePagaInput, parametri);

    return json(200, { risultato, parametri });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

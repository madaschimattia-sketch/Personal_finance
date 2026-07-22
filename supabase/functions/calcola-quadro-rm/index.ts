// calcola-quadro-rm — Aggrega dividendi/interessi/cedole (tax_movements) in eventi
// quadro RM Sezione V per l'anno richiesto, con credito d'imposta per le ritenute
// estere subite.
//
// Protetta da JWT utente. Aggregazione per UTENTE su tutti i suoi conti (come
// calcola-quadro-rt): la dichiarazione e' unica, non per singolo broker.
//
// Sicurezza anni gia' dichiarati: rifiuta di calcolare/scrivere per un anno con
// dichiarazioni_fiscali.stato='presentata'.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaQuadroRM, type RedditoCapitaleInput, type RitenutaInput } from "../_shared/quadro-rm.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Categoria = "ordinaria" | "whitelist";

function categoriaDaStrumento(info: { classificazione_confermata: boolean; is_titolo_stato_whitelist: boolean | null } | null): Categoria | null {
  if (info === null) return "ordinaria"; // nessuno strumento associato (es. interessi su cassa): sempre ordinaria
  if (!info.classificazione_confermata) return null;
  return info.is_titolo_stato_whitelist ? "whitelist" : "ordinaria";
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
    const anno = Number(body?.anno);
    if (!Number.isInteger(anno)) return json(400, { error: "Parametro 'anno' mancante o non valido" });

    const { data: dich, error: dichErr } = await admin
      .from("dichiarazioni_fiscali")
      .select("stato")
      .eq("user_id", userId)
      .eq("anno", anno)
      .maybeSingle();
    if (dichErr) return json(500, { error: `Lettura dichiarazioni_fiscali fallita: ${dichErr.message}` });
    if (dich?.stato === "presentata") {
      return json(409, { error: `L'anno ${anno} risulta gia' presentato (dichiarazioni_fiscali): il quadro RM non viene ricalcolato/sovrascritto.` });
    }

    const { data: parametri, error: parErr } = await admin
      .from("config_fiscale_parametri")
      .select("chiave, valore")
      .eq("anno", anno)
      .in("chiave", ["aliquota_capital_gain_ordinaria_pct", "aliquota_whitelist_titoli_stato_pct"]);
    if (parErr) return json(500, { error: `Lettura config_fiscale_parametri fallita: ${parErr.message}` });
    const paramByChiave = new Map((parametri ?? []).map((p) => [p.chiave as string, Number(p.valore)]));
    const ordinariaPct = paramByChiave.get("aliquota_capital_gain_ordinaria_pct");
    const whitelistPct = paramByChiave.get("aliquota_whitelist_titoli_stato_pct");
    if (ordinariaPct === undefined || whitelistPct === undefined) {
      return json(500, { error: `Aliquote mancanti in config_fiscale_parametri per l'anno ${anno}` });
    }

    const { data: contiRows, error: contiErr } = await admin.from("conti").select("id").eq("user_id", userId);
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    const contoIds = (contiRows ?? []).map((c) => c.id as string);
    if (contoIds.length === 0) return json(200, { anno, eventi: [] });

    const { data: movRows, error: movErr } = await admin
      .from("tax_movements")
      .select("id, tipo, importo_eur, instrument_id")
      .in("conto_id", contoIds)
      .in("tipo", ["dividendo", "cedola", "interessi", "ritenuta"])
      .gte("data", `${anno}-01-01`)
      .lte("data", `${anno}-12-31`);
    if (movErr) return json(500, { error: `Lettura tax_movements fallita: ${movErr.message}` });

    const instrumentIds = [...new Set((movRows ?? []).map((m) => m.instrument_id as string | null).filter((id): id is string => id !== null))];
    const { data: strumenti, error: strErr } = await admin
      .from("tax_instruments")
      .select("id, classificazione_confermata, is_titolo_stato_whitelist")
      .in("id", instrumentIds.length > 0 ? instrumentIds : ["00000000-0000-0000-0000-000000000000"]);
    if (strErr) return json(500, { error: `Lettura tax_instruments fallita: ${strErr.message}` });
    const infoById = new Map((strumenti ?? []).map((s) => [s.id as string, {
      classificazione_confermata: s.classificazione_confermata as boolean,
      is_titolo_stato_whitelist: s.is_titolo_stato_whitelist as boolean | null,
    }]));

    const redditi: RedditoCapitaleInput[] = [];
    const ritenute: RitenutaInput[] = [];
    for (const m of movRows ?? []) {
      const info = m.instrument_id ? infoById.get(m.instrument_id as string) ?? null : null;
      const categoria = categoriaDaStrumento(info);
      if (m.tipo === "ritenuta") {
        ritenute.push({ id: m.id, categoria, importo_eur: Math.abs(Number(m.importo_eur)) });
      } else {
        redditi.push({ id: m.id, categoria, importo_eur: Number(m.importo_eur) });
      }
    }

    const risultato = calcolaQuadroRM(redditi, ritenute, { ordinaria_pct: ordinariaPct, whitelist_pct: whitelistPct });

    const { error: delErr } = await admin
      .from("tax_events")
      .delete()
      .eq("user_id", userId)
      .eq("anno", anno)
      .eq("quadro", "RM");
    if (delErr) return json(500, { error: `Pulizia tax_events fallita: ${delErr.message}` });

    if (risultato.eventi.length > 0) {
      const { error } = await admin.from("tax_events").insert(
        risultato.eventi.map((e) => ({
          user_id: userId,
          conto_id: null,
          anno,
          quadro: e.quadro,
          tipo: e.tipo,
          riferimento_id: null,
          imponibile_eur: e.imponibile_eur,
          aliquota_pct: e.aliquota_pct,
          imposta_eur: e.imposta_eur,
          note: e.note,
        })),
      );
      if (error) return json(500, { error: `Insert tax_events fallito: ${error.message}` });
    }

    return json(200, {
      anno,
      eventi: risultato.eventi,
      redditi_non_classificati: risultato.redditiNonClassificati,
      ritenute_non_classificate: risultato.ritenuteNonClassificate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

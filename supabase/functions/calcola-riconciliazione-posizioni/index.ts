// calcola-riconciliazione-posizioni — Confronta le posizioni aperte calcolate dal
// motore lotti (tax_lots) con lo snapshot OpenPosition di IBKR (posizioni_aperte_ibkr,
// ultima report_date disponibile per conto), per scovare divergenze dovute a movimenti
// mancanti/mal mappati nel backfill o nei pull successivi.
//
// Strumento di VALIDAZIONE, non di calcolo fiscale: non scrive tax_events, non e'
// soggetto alla sicurezza anni gia' dichiarati (non modifica nulla, solo confronta e
// riporta). Protetta da JWT utente.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { riconcilia, type LottoAperto, type PosizioneIbkr } from "../_shared/riconciliazione-posizioni.ts";

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

    let contoIdFiltro: string | undefined;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      contoIdFiltro = body?.conto_id;
    }

    let contiQuery = admin.from("conti").select("id").eq("user_id", userId);
    if (contoIdFiltro) contiQuery = contiQuery.eq("id", contoIdFiltro);
    const { data: conti, error: contiErr } = await contiQuery;
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    if (!conti || conti.length === 0) return json(200, { results: [] });

    const results = [];
    for (const conto of conti) {
      try {
        const { data: ultimaDataRow, error: dataErr } = await admin
          .from("posizioni_aperte_ibkr")
          .select("report_date")
          .eq("conto_id", conto.id)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dataErr) throw new Error(`Lettura ultima report_date fallita: ${dataErr.message}`);

        if (!ultimaDataRow) {
          results.push({ conto_id: conto.id, status: "skipped", motivo: "Nessuno snapshot OpenPosition disponibile per questo conto" });
          continue;
        }
        const ultimaData = ultimaDataRow.report_date as string;

        const { data: posizioniRows, error: posErr } = await admin
          .from("posizioni_aperte_ibkr")
          .select("conid, isin, symbol, position")
          .eq("conto_id", conto.id)
          .eq("report_date", ultimaData);
        if (posErr) throw new Error(`Lettura posizioni_aperte_ibkr fallita: ${posErr.message}`);

        const { data: lottiRows, error: lottiErr } = await admin
          .from("tax_lots")
          .select("instrument_id, quantita_residua")
          .eq("conto_id", conto.id)
          .eq("stato", "aperto");
        if (lottiErr) throw new Error(`Lettura tax_lots fallita: ${lottiErr.message}`);

        const isins = [...new Set((posizioniRows ?? []).map((p) => p.isin as string | null).filter((v): v is string => v !== null))];
        const { data: strumenti, error: strErr } = await admin
          .from("tax_instruments")
          .select("id, isin")
          .in("isin", isins.length > 0 ? isins : ["__nessuno__"]);
        if (strErr) throw new Error(`Lettura tax_instruments fallita: ${strErr.message}`);
        const instrumentIdByIsin = new Map((strumenti ?? []).map((s) => [s.isin as string, s.id as string]));

        const lottiAperti: LottoAperto[] = (lottiRows ?? []).map((l) => ({
          instrumentId: l.instrument_id as string,
          quantitaResidua: Number(l.quantita_residua),
        }));
        const posizioni: PosizioneIbkr[] = (posizioniRows ?? []).map((p) => ({
          instrumentId: p.isin ? instrumentIdByIsin.get(p.isin as string) ?? null : null,
          conid: p.conid as string,
          isin: p.isin as string | null,
          symbol: p.symbol as string | null,
          position: Number(p.position),
        }));

        const risultato = riconcilia(lottiAperti, posizioni);
        results.push({
          conto_id: conto.id,
          status: "ok",
          report_date_confrontata: ultimaData,
          strumenti_concordanti: risultato.strumentiConcordanti,
          divergenze: risultato.divergenze,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ conto_id: conto.id, status: "error", errore: message });
      }
    }

    return json(200, { results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

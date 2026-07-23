// calcola-quadro-rw-dettaglio — Elenco riga-per-riga dei prodotti finanziari esteri
// detenuti (monitoraggio valutario del quadro RW), distinto dall'IVAFE (calcolata da
// calcola-quadro-rw). Confronta lo snapshot posizioni_aperte_ibkr di fine anno
// precedente (= inizio periodo) con quello di fine anno corrente (= fine periodo).
//
// Strumento di REPORTING, non di calcolo fiscale: non scrive tax_events, non e'
// soggetto alla sicurezza anni gia' dichiarati (non modifica nulla). Per conto (come
// calcola-quadro-rw), protetta da JWT utente.
//
// Limite noto: uno strumento comprato E venduto interamente durante l'anno non compare
// in nessuno dei due snapshot — viene individuato separatamente dai tax_movements
// dell'anno e riportato in `strumenti_attivita_non_in_snapshot` per revisione manuale.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { costruisciDettaglioRW, type PosizioneValoreSnapshot } from "../_shared/quadro-rw-dettaglio.ts";

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
    const anno = Number(body?.anno);
    if (!Number.isInteger(anno)) return json(400, { error: "Parametro 'anno' mancante o non valido" });
    const contoIdFiltro: string | undefined = body?.conto_id;

    let contiQuery = admin.from("conti").select("id").eq("user_id", userId);
    if (contoIdFiltro) contiQuery = contiQuery.eq("id", contoIdFiltro);
    const { data: conti, error: contiErr } = await contiQuery;
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    if (!conti || conti.length === 0) return json(200, { anno, results: [] });

    const results = [];
    for (const conto of conti) {
      try {
        // ultima report_date <= 31/12 dell'anno precedente (= inizio periodo di questo anno)
        const { data: dataInizioRow, error: dataInizioErr } = await admin
          .from("posizioni_aperte_ibkr")
          .select("report_date")
          .eq("conto_id", conto.id)
          .lte("report_date", `${anno - 1}-12-31`)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dataInizioErr) throw new Error(`Lettura data inizio periodo fallita: ${dataInizioErr.message}`);

        // ultima report_date nell'anno richiesto (= fine periodo)
        const { data: dataFineRow, error: dataFineErr } = await admin
          .from("posizioni_aperte_ibkr")
          .select("report_date")
          .eq("conto_id", conto.id)
          .gte("report_date", `${anno}-01-01`)
          .lte("report_date", `${anno}-12-31`)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dataFineErr) throw new Error(`Lettura data fine periodo fallita: ${dataFineErr.message}`);

        const dataInizio = dataInizioRow?.report_date as string | undefined;
        const dataFine = dataFineRow?.report_date as string | undefined;

        const [posInizioRes, posFineRes] = await Promise.all([
          dataInizio
            ? admin.from("posizioni_aperte_ibkr").select("conid, isin, symbol, position_value_eur")
              .eq("conto_id", conto.id).eq("report_date", dataInizio)
            : Promise.resolve({ data: [], error: null }),
          dataFine
            ? admin.from("posizioni_aperte_ibkr").select("conid, isin, symbol, position_value_eur")
              .eq("conto_id", conto.id).eq("report_date", dataFine)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (posInizioRes.error) throw new Error(`Lettura posizioni inizio periodo fallita: ${posInizioRes.error.message}`);
        if (posFineRes.error) throw new Error(`Lettura posizioni fine periodo fallita: ${posFineRes.error.message}`);

        const tuttiIConid = [...new Set([
          ...(posInizioRes.data ?? []).map((p) => p.conid as string),
          ...(posFineRes.data ?? []).map((p) => p.conid as string),
        ])];
        const tuttiGliIsin = [...new Set([
          ...(posInizioRes.data ?? []).map((p) => p.isin as string | null),
          ...(posFineRes.data ?? []).map((p) => p.isin as string | null),
        ].filter((v): v is string => v !== null))];
        // Paese risolto per ISIN quando possibile (stabile), conid come fallback: IBKR
        // puo' riassegnare il conid alla stessa posizione da un anno all'altro (vedi
        // nota in quadro-rw-dettaglio.ts), quindi un lookup solo per conid potrebbe non
        // trovare lo strumento gia' censito con un conid diverso.
        const { data: strumentiPerConid, error: strErr } = await admin
          .from("tax_instruments")
          .select("conid, issuer_country_code")
          .in("conid", tuttiIConid.length > 0 ? tuttiIConid : ["__nessuno__"]);
        if (strErr) throw new Error(`Lettura tax_instruments (conid) fallita: ${strErr.message}`);
        const { data: strumentiPerIsin, error: strIsinErr } = await admin
          .from("tax_instruments")
          .select("isin, issuer_country_code")
          .in("isin", tuttiGliIsin.length > 0 ? tuttiGliIsin : ["__nessuno__"]);
        if (strIsinErr) throw new Error(`Lettura tax_instruments (isin) fallita: ${strIsinErr.message}`);
        const paeseByConid = new Map((strumentiPerConid ?? []).map((s) => [s.conid as string, s.issuer_country_code as string | null]));
        const paeseByIsin = new Map((strumentiPerIsin ?? []).map((s) => [s.isin as string, s.issuer_country_code as string | null]));

        const toSnapshot = (rows: { conid: string; isin: string | null; symbol: string | null; position_value_eur: number }[]): PosizioneValoreSnapshot[] =>
          rows.map((r) => ({
            conid: r.conid,
            isin: r.isin,
            symbol: r.symbol,
            paeseCodice: (r.isin ? paeseByIsin.get(r.isin) : undefined) ?? paeseByConid.get(r.conid) ?? null,
            positionValueEur: Number(r.position_value_eur),
          }));

        const righe = costruisciDettaglioRW(
          toSnapshot((posInizioRes.data ?? []) as { conid: string; isin: string | null; symbol: string | null; position_value_eur: number }[]),
          toSnapshot((posFineRes.data ?? []) as { conid: string; isin: string | null; symbol: string | null; position_value_eur: number }[]),
        );

        // strumenti con tax_movements nell'anno ma assenti da entrambi gli snapshot
        // (comprati E venduti interamente durante l'anno)
        const { data: movimentiAnno, error: movErr } = await admin
          .from("tax_movements")
          .select("instrument_id")
          .eq("conto_id", conto.id)
          .in("tipo", ["acquisto", "vendita"])
          .gte("data", `${anno}-01-01`)
          .lte("data", `${anno}-12-31`)
          .not("instrument_id", "is", null);
        if (movErr) throw new Error(`Lettura tax_movements fallita: ${movErr.message}`);
        const instrumentIdsAnno = [...new Set((movimentiAnno ?? []).map((m) => m.instrument_id as string))];

        const isinInSnapshot = new Set(righe.map((r) => r.isin).filter((v): v is string => v !== null));
        const conidInSnapshot = new Set(righe.map((r) => r.conid));
        const { data: strumentiAnno, error: strAnnoErr } = await admin
          .from("tax_instruments")
          .select("id, conid, isin, symbol")
          .in("id", instrumentIdsAnno.length > 0 ? instrumentIdsAnno : ["00000000-0000-0000-0000-000000000000"]);
        if (strAnnoErr) throw new Error(`Lettura tax_instruments (anno) fallita: ${strAnnoErr.message}`);
        const strumentiNonInSnapshot = (strumentiAnno ?? []).filter((s) =>
          s.isin ? !isinInSnapshot.has(s.isin as string) : !(s.conid && conidInSnapshot.has(s.conid as string))
        );

        results.push({
          conto_id: conto.id,
          status: "ok",
          data_inizio_periodo: dataInizio ?? null,
          data_fine_periodo: dataFine ?? null,
          righe,
          strumenti_attivita_non_in_snapshot: strumentiNonInSnapshot,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ conto_id: conto.id, status: "error", errore: message });
      }
    }

    return json(200, { anno, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

// calcola-lotti-fiscali — Ricostruisce tax_lots/tax_lot_closures da tax_movements.
//
// Protetta da JWT utente (stesso pattern di ibkr-flex-pull): si processano solo i
// conti dell'utente autenticato. Strategia FULL RECOMPUTE (vedi lot-matching.ts):
// per ogni conto/strumento, i lotti esistenti vengono cancellati e ricostruiti da
// zero dai tax_movements attuali. Corretto solo finche' non esistono annualita'
// gia' dichiarate — da rivedere (ricalcolo incrementale) prima di un uso reale
// post-dichiarazione.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaLotti, type InstrumentTaxInfo, type TaxMovementInput } from "../_shared/lot-matching.ts";

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

    let contiQuery = admin.from("conti").select("id, user_id").eq("user_id", userId);
    if (contoIdFiltro) contiQuery = contiQuery.eq("id", contoIdFiltro);
    const { data: conti, error: contiErr } = await contiQuery;
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    if (!conti || conti.length === 0) return json(200, { results: [] });

    const results = [];
    for (const conto of conti) {
      try {
        const { data: movimenti, error: movErr } = await admin
          .from("tax_movements")
          .select("id, tipo, data, quantita, importo_eur, instrument_id")
          .eq("conto_id", conto.id)
          .in("tipo", ["acquisto", "vendita"])
          .not("instrument_id", "is", null);
        if (movErr) throw new Error(`Lettura tax_movements fallita: ${movErr.message}`);

        const instrumentIds = [...new Set((movimenti ?? []).map((m) => m.instrument_id as string))];
        const { data: strumenti, error: strErr } = await admin
          .from("tax_instruments")
          .select("id, metodo_costo, is_titolo_stato_whitelist, is_oicr, classificazione_confermata")
          .in("id", instrumentIds.length > 0 ? instrumentIds : ["00000000-0000-0000-0000-000000000000"]);
        if (strErr) throw new Error(`Lettura tax_instruments fallita: ${strErr.message}`);
        const infoById = new Map(
          (strumenti ?? []).map((s) => [s.id as string, {
            metodo_costo: s.metodo_costo,
            is_titolo_stato_whitelist: s.is_titolo_stato_whitelist,
            is_oicr: s.is_oicr,
            classificazione_confermata: s.classificazione_confermata,
          } as InstrumentTaxInfo]),
        );

        const movByInstrument = new Map<string, TaxMovementInput[]>();
        for (const m of movimenti ?? []) {
          const list = movByInstrument.get(m.instrument_id as string) ?? [];
          list.push({ id: m.id, tipo: m.tipo, data: m.data, quantita: Number(m.quantita), importo_eur: Number(m.importo_eur) });
          movByInstrument.set(m.instrument_id as string, list);
        }

        // full recompute: cancella i lotti esistenti per questo conto (cascade su closures)
        const { error: delErr } = await admin.from("tax_lots").delete().eq("conto_id", conto.id);
        if (delErr) throw new Error(`Pulizia tax_lots fallita: ${delErr.message}`);

        let totLots = 0, totClosures = 0, totAnomalie = 0;
        for (const [instrumentId, movs] of movByInstrument) {
          const info = infoById.get(instrumentId);
          if (!info) continue;
          const { lots, closures, anomalie } = calcolaLotti(movs, info);

          if (lots.length > 0) {
            const { error } = await admin.from("tax_lots").insert(
              lots.map((l) => ({
                id: l.id,
                user_id: userId,
                conto_id: conto.id,
                instrument_id: instrumentId,
                acquisto_movement_id: l.acquisto_movement_id,
                metodo_applicato: l.metodo_applicato,
                data_acquisto: l.data_acquisto,
                quantita_originale: l.quantita_originale,
                quantita_residua: l.quantita_residua,
                costo_unitario_eur: l.costo_unitario_eur,
                costo_totale_eur: l.costo_totale_eur,
                stato: l.stato,
              })),
            );
            if (error) throw new Error(`Insert tax_lots fallito: ${error.message}`);
          }
          if (closures.length > 0) {
            const { error } = await admin.from("tax_lot_closures").insert(
              closures.map((c) => ({
                user_id: userId,
                lot_id: c.lot_id,
                vendita_movement_id: c.vendita_movement_id,
                data_chiusura: c.data_chiusura,
                quantita_chiusa: c.quantita_chiusa,
                costo_eur: c.costo_eur,
                ricavo_eur: c.ricavo_eur,
                plus_minus_eur: c.plus_minus_eur,
                giorni_detenzione: c.giorni_detenzione,
                categoria_compensazione: c.categoria_compensazione,
              })),
            );
            if (error) throw new Error(`Insert tax_lot_closures fallito: ${error.message}`);
          }
          totLots += lots.length;
          totClosures += closures.length;
          totAnomalie += anomalie.length;
        }

        results.push({ conto_id: conto.id, status: "ok", lots: totLots, closures: totClosures, anomalie: totAnomalie });
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

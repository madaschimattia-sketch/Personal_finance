// calcola-lotti-fiscali — Ricostruisce tax_lots/tax_lot_closures da tax_movements.
//
// Protetta da JWT utente (stesso pattern di ibkr-flex-pull): si processano solo i
// conti dell'utente autenticato.
//
// Sicurezza anni gia' dichiarati: il motore (lot-matching.ts) resta full-recompute
// in memoria, ma riusa gli id lotto esistenti (lottiEsistenti, chiave
// acquisto_movement_id) cosi' le chiusure sono confrontabili 1:1 con quelle gia' in
// DB tramite (lot_id, vendita_movement_id). Per ogni strumento: se una chiusura
// ricalcolata cade in un anno con dichiarazioni_fiscali.stato='presentata' e diverge
// (o manca, o e' sparita) rispetto a quanto gia' registrato, lo strumento viene
// SALTATO integralmente (nessuna scrittura) e la divergenza riportata in
// `anni_bloccati_divergenti` — non si sovrascrive mai un anno gia' dichiarato senza
// che un umano lo veda. Solo gli strumenti senza divergenze su anni bloccati vengono
// effettivamente cancellati/reinseriti (full recompute, ma scoped al singolo
// strumento, non piu' all'intero conto).
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaLotti, type Anomalia, type InstrumentTaxInfo, type TaxMovementInput } from "../_shared/lot-matching.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function anno(data: string): number {
  return Number(data.slice(0, 4));
}

const EPS = 0.01; // tolleranza in EUR per confronto float su chiusure gia' dichiarate

function chiusuraDiverge(
  nuova: { quantita_chiusa: number; costo_eur: number; ricavo_eur: number; plus_minus_eur: number },
  esistente: { quantita_chiusa: number; costo_eur: number; ricavo_eur: number; plus_minus_eur: number },
): boolean {
  return (
    Math.abs(nuova.quantita_chiusa - esistente.quantita_chiusa) > 1e-6 ||
    Math.abs(nuova.costo_eur - esistente.costo_eur) > EPS ||
    Math.abs(nuova.ricavo_eur - esistente.ricavo_eur) > EPS ||
    Math.abs(nuova.plus_minus_eur - esistente.plus_minus_eur) > EPS
  );
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

    const { data: dichiarazioni, error: dichErr } = await admin
      .from("dichiarazioni_fiscali")
      .select("anno, stato")
      .eq("user_id", userId)
      .eq("stato", "presentata");
    if (dichErr) return json(500, { error: `Lettura dichiarazioni_fiscali fallita: ${dichErr.message}` });
    const anniBloccati = new Set((dichiarazioni ?? []).map((d) => d.anno as number));

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
          .select("id, tipo, data, quantita, importo_eur, instrument_id, evento_opzione")
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
          list.push({
            id: m.id,
            tipo: m.tipo,
            data: m.data,
            quantita: Number(m.quantita),
            importo_eur: Number(m.importo_eur),
            evento_opzione: m.evento_opzione ?? null,
          });
          movByInstrument.set(m.instrument_id as string, list);
        }

        // stato esistente per strumento (letto una volta per conto, prima di qualunque scrittura)
        const { data: lottiEsistentiRows, error: lotErr } = await admin
          .from("tax_lots")
          .select("id, instrument_id, acquisto_movement_id")
          .eq("conto_id", conto.id);
        if (lotErr) throw new Error(`Lettura tax_lots fallita: ${lotErr.message}`);

        const lotIds = (lottiEsistentiRows ?? []).map((l) => l.id as string);
        const { data: closureEsistentiRows, error: closErr } = await admin
          .from("tax_lot_closures")
          .select("lot_id, vendita_movement_id, data_chiusura, quantita_chiusa, costo_eur, ricavo_eur, plus_minus_eur")
          .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"]);
        if (closErr) throw new Error(`Lettura tax_lot_closures fallita: ${closErr.message}`);

        const lottiByInstrument = new Map<string, typeof lottiEsistentiRows>();
        for (const l of lottiEsistentiRows ?? []) {
          const list = lottiByInstrument.get(l.instrument_id as string) ?? [];
          list.push(l);
          lottiByInstrument.set(l.instrument_id as string, list);
        }
        const closureByLotId = new Map<string, typeof closureEsistentiRows>();
        for (const c of closureEsistentiRows ?? []) {
          const list = closureByLotId.get(c.lot_id as string) ?? [];
          list.push(c);
          closureByLotId.set(c.lot_id as string, list);
        }

        let totLots = 0, totClosures = 0, totAnomalie = 0;
        const strumentiSaltati: { instrument_id: string; motivo: string; dettaglio: unknown }[] = [];
        const anomalieDettaglio: (Anomalia & { instrument_id: string })[] = [];

        for (const [instrumentId, movs] of movByInstrument) {
          const info = infoById.get(instrumentId);
          if (!info) continue;

          const lottiEsistenti = new Map<string, string>();
          for (const l of lottiByInstrument.get(instrumentId) ?? []) {
            lottiEsistenti.set(l.acquisto_movement_id as string, l.id as string);
          }

          const { lots, closures, anomalie } = calcolaLotti(movs, info, lottiEsistenti);

          // confronto chiusure ricalcolate vs esistenti, solo per anni gia' dichiarati
          const divergenze: unknown[] = [];
          for (const c of closures) {
            if (!anniBloccati.has(anno(c.data_chiusura))) continue;
            const esistentiPerLotto = closureByLotId.get(c.lot_id) ?? [];
            const match = esistentiPerLotto.find((e) => e.vendita_movement_id === c.vendita_movement_id);
            if (!match) {
              divergenze.push({ tipo: "chiusura_mancante_in_db", lot_id: c.lot_id, vendita_movement_id: c.vendita_movement_id, anno: anno(c.data_chiusura) });
            } else if (chiusuraDiverge(c, match)) {
              divergenze.push({ tipo: "valori_diversi", lot_id: c.lot_id, vendita_movement_id: c.vendita_movement_id, anno: anno(c.data_chiusura), nuova: c, esistente: match });
            }
          }
          // chiusure esistenti in anni bloccati che il ricalcolo non riproduce piu'
          for (const [lotId, esistentiPerLotto] of closureByLotId) {
            const lot = (lottiByInstrument.get(instrumentId) ?? []).find((l) => l.id === lotId);
            if (!lot) continue;
            for (const e of esistentiPerLotto) {
              if (!anniBloccati.has(anno(e.data_chiusura as string))) continue;
              const stillThere = closures.some((c) => c.lot_id === lotId && c.vendita_movement_id === e.vendita_movement_id);
              if (!stillThere) {
                divergenze.push({ tipo: "chiusura_scomparsa", lot_id: lotId, vendita_movement_id: e.vendita_movement_id, anno: anno(e.data_chiusura as string) });
              }
            }
          }

          if (divergenze.length > 0) {
            strumentiSaltati.push({ instrument_id: instrumentId, motivo: "divergenza su anno gia' dichiarato", dettaglio: divergenze });
            continue; // nessuna scrittura per questo strumento: si preserva lo stato in DB
          }

          // sicuro procedere: cancella (cascade su closures) e reinserisce solo per questo strumento
          const { error: delErr } = await admin.from("tax_lots").delete().eq("conto_id", conto.id).eq("instrument_id", instrumentId);
          if (delErr) throw new Error(`Pulizia tax_lots (strumento ${instrumentId}) fallita: ${delErr.message}`);

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
          for (const a of anomalie) anomalieDettaglio.push({ ...a, instrument_id: instrumentId });
        }

        results.push({
          conto_id: conto.id,
          status: "ok",
          lots: totLots,
          closures: totClosures,
          anomalie: totAnomalie,
          anomalie_dettaglio: anomalieDettaglio,
          strumenti_saltati_per_divergenza: strumentiSaltati,
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

import { supabase } from "./supabase.js";

// Factory condivisa per conti "amministrato" senza motore fiscale proprio
// (Banca Generali, Widiba, e i prossimi che verranno aggiunti): niente
// tax_lots/tax_movements, le posizioni si aggregano direttamente dal ledger
// `movimenti` (costo medio ponderato, niente LIFO) unite al valore attuale
// da `posizioni_aperte_ibkr` (riuso pragmatico della tabella IBKR, già
// generica). Quota per l'intestatario selezionato: 100% o 0% (mai
// frazionaria, nessuna cointestazione su questi conti), stessa regola di
// quotaContoIbkr — se in futuro un conto di questo tipo dovesse diventare
// cointestato, questa funzione andrebbe estesa allo stesso pattern di
// conto.js (leggere tutte le righe, non solo quella cercata).
export async function quotaContoGenerico(broker, intestatarioId) {
  const { data: conto } = await supabase.from("conti").select("id").eq("attivo", true).eq("broker", broker).limit(1).maybeSingle();
  if (!conto) return { quota: 0, contoId: null };
  const { data: righeConto } = await supabase.from("conto_intestatari")
    .select("intestatario_id, quota_percentuale").eq("conto_id", conto.id);
  if (!righeConto || righeConto.length === 0) return { quota: 1, contoId: conto.id };
  const riga = righeConto.find((r) => r.intestatario_id === intestatarioId);
  return { quota: riga ? Number(riga.quota_percentuale) / 100 : 0, contoId: conto.id };
}

// Aggregazione posizioni per ISIN da `movimenti` (quantità netta, costo medio
// ponderato sui soli acquisti) unita al valore attuale da
// `posizioni_aperte_ibkr` (ultimo report_date per questo conto, se presente
// — senza uno snapshot valoreAttuale resta null, mai stimato). Ritorna righe
// nella stessa forma usate da Portafoglio.jsx per l'IBKR: {symbol,
// assetClass, quantita, costo, valoreAttuale, plNonRealizzato, plPct}.
export async function caricaPosizioniContoGenerico(broker, intestatarioId) {
  const { quota, contoId } = await quotaContoGenerico(broker, intestatarioId);
  if (quota === 0 || !contoId) return [];

  const [{ data: movimenti }, { data: ultimaPos }] = await Promise.all([
    supabase.from("movimenti").select("isin, quantita, prezzo, commissioni, importo").eq("conto_id", contoId).order("data", { ascending: true }),
    supabase.from("posizioni_aperte_ibkr").select("report_date").eq("conto_id", contoId).order("report_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  let posizioniAttuali = [];
  if (ultimaPos) {
    const { data } = await supabase.from("posizioni_aperte_ibkr")
      .select("isin, position, mark_price, position_value_eur")
      .eq("conto_id", contoId).eq("report_date", ultimaPos.report_date);
    posizioniAttuali = data ?? [];
  }
  const posPerIsin = new Map(posizioniAttuali.map((p) => [p.isin, p]));

  const isinUnici = [...new Set((movimenti ?? []).map((m) => m.isin))];
  const { data: strumenti } = isinUnici.length > 0
    ? await supabase.from("tax_instruments").select("isin, descrizione, asset_class").in("isin", isinUnici)
    : { data: [] };
  const strumentoPerIsin = new Map((strumenti ?? []).map((s) => [s.isin, s]));

  // Costo medio ponderato: solo gli acquisti (quantita positiva) contribuiscono
  // al costo; le vendite riducono la quantità in proporzione, senza modificare
  // il costo medio residuo (media ponderata standard, coerente con l'assenza
  // di lot-matching per questi conti). Righe non di trade (dividendi, addebiti
  // — quantita null/0) non alterano quantità/costo, per costruzione.
  const aggregati = new Map();
  for (const m of movimenti ?? []) {
    const esistente = aggregati.get(m.isin) ?? { quantita: 0, costo: 0 };
    if (Number(m.quantita) > 0) {
      esistente.quantita += Number(m.quantita);
      esistente.costo += Math.abs(Number(m.importo));
    } else {
      const quantitaVenduta = Math.abs(Number(m.quantita));
      const costoMedioUnitario = esistente.quantita > 0 ? esistente.costo / esistente.quantita : 0;
      esistente.quantita += Number(m.quantita); // quantita negativa: riduce
      esistente.costo -= costoMedioUnitario * quantitaVenduta;
    }
    aggregati.set(m.isin, esistente);
  }

  const risultato = [];
  for (const [isin, agg] of aggregati.entries()) {
    if (agg.quantita <= 1e-9) continue; // posizione chiusa
    const posizione = posPerIsin.get(isin);
    const valoreAttuale = posizione ? Number(posizione.position_value_eur) * quota : null;
    const costo = agg.costo * quota;
    const quantita = agg.quantita * quota;
    const plNonRealizzato = valoreAttuale !== null ? valoreAttuale - costo : null;
    const strumento = strumentoPerIsin.get(isin);
    risultato.push({
      symbol: strumento?.descrizione ?? isin,
      assetClass: strumento?.asset_class ?? "Other",
      isin,
      quantita,
      costo,
      valoreAttuale,
      plNonRealizzato,
      plPct: plNonRealizzato !== null && costo > 0 ? (plNonRealizzato / costo) * 100 : null,
    });
  }
  return risultato;
}

// Motore di matching lotti — LIFO (azioni/obbligazioni/opzioni) o media ponderata
// (ETF/OICR, secondo tax_instruments.metodo_costo). Input: tax_movements di tipo
// 'acquisto'/'vendita' per un singolo strumento, gia' ordinati cronologicamente.
// Puro/testabile: nessuna dipendenza da Supabase, solo strutture dati in ingresso/uscita.
//
// Strategia di ricalcolo: FULL RECOMPUTE per strumento/conto ad ogni esecuzione (i lotti
// esistenti vengono cancellati e ricostruiti da zero dai tax_movements correnti). Corretto
// finche' non esistono annualita' gia' dichiarate: quando si introduce il primo utilizzo
// "in produzione" (dichiarazione presentata), il ricalcolo dovra' diventare incrementale
// per non riscrivere lotti di anni gia' chiusi — non ancora implementato.

export interface TaxMovementInput {
  id: string;
  tipo: "acquisto" | "vendita";
  data: string; // YYYY-MM-DD
  quantita: number; // con segno: positiva per acquisto, negativa per vendita
  importo_eur: number; // con segno: negativo per acquisto (uscita cassa), positivo per vendita (gia' netto commissioni)
}

export interface InstrumentTaxInfo {
  metodo_costo: "lifo" | "media_ponderata";
  is_titolo_stato_whitelist: boolean | null;
  is_oicr: boolean | null;
  classificazione_confermata: boolean;
}

export interface LotOutput {
  id: string; // uuid pre-generato dal chiamante, cosi' le closures possono referenziarlo
  acquisto_movement_id: string;
  metodo_applicato: "lifo" | "media_ponderata";
  data_acquisto: string;
  quantita_originale: number;
  quantita_residua: number;
  costo_unitario_eur: number;
  costo_totale_eur: number;
  stato: "aperto" | "chiuso";
}

export interface ClosureOutput {
  lot_id: string;
  vendita_movement_id: string;
  data_chiusura: string;
  quantita_chiusa: number;
  costo_eur: number;
  ricavo_eur: number;
  plus_minus_eur: number;
  giorni_detenzione: number;
  categoria_compensazione: "ordinaria" | "whitelist" | "oicr_non_compensabile" | null;
}

export interface EngineResult {
  lots: LotOutput[];
  closures: ClosureOutput[];
  // vendite che non hanno trovato quantita' sufficiente nei lotti aperti (dato mancante
  // o errore di sequenza) — vanno segnalate, mai ignorate silenziosamente.
  anomalie: { vendita_movement_id: string; quantita_non_coperta: number }[];
}

function giorniTra(dataA: string, dataB: string): number {
  const msPerGiorno = 24 * 60 * 60 * 1000;
  return Math.round((new Date(dataB).getTime() - new Date(dataA).getTime()) / msPerGiorno);
}

function categoriaCompensazione(info: InstrumentTaxInfo): ClosureOutput["categoria_compensazione"] {
  if (!info.classificazione_confermata) return null; // non certificare una categoria non confermata
  if (info.is_oicr) return "oicr_non_compensabile";
  if (info.is_titolo_stato_whitelist) return "whitelist";
  return "ordinaria";
}

/** Genera un id v4 senza dipendere da un runtime specifico (Deno o Node hanno entrambi crypto.randomUUID). */
export function nuovoId(): string {
  return crypto.randomUUID();
}

export function calcolaLotti(
  movimenti: TaxMovementInput[],
  info: InstrumentTaxInfo,
): EngineResult {
  const ordinati = [...movimenti].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  const lots: LotOutput[] = [];
  const closures: ClosureOutput[] = [];
  const anomalie: EngineResult["anomalie"] = [];
  const categoria = categoriaCompensazione(info);

  for (const m of ordinati) {
    if (m.tipo === "acquisto") {
      const quantitaOriginale = m.quantita;
      const costoTotale = Math.abs(m.importo_eur);
      lots.push({
        id: nuovoId(),
        acquisto_movement_id: m.id,
        metodo_applicato: info.metodo_costo,
        data_acquisto: m.data,
        quantita_originale: quantitaOriginale,
        quantita_residua: quantitaOriginale,
        costo_unitario_eur: quantitaOriginale !== 0 ? costoTotale / quantitaOriginale : 0,
        costo_totale_eur: costoTotale,
        stato: "aperto",
      });
      continue;
    }

    // vendita
    let daChiudere = Math.abs(m.quantita);
    const ricavoTotale = m.importo_eur;
    const ricavoUnitario = daChiudere !== 0 ? ricavoTotale / daChiudere : 0;

    const aperti = lots.filter((l) => l.quantita_residua > 1e-9 && l.data_acquisto <= m.data);
    // LIFO: piu' recenti prima. Media ponderata: costo uniforme, ordine FIFO solo per
    // contabilita' di quale lotto si esaurisce prima (non cambia il plus/minus totale).
    const ordineChiusura = info.metodo_costo === "lifo"
      ? [...aperti].sort((a, b) => b.data_acquisto.localeCompare(a.data_acquisto))
      : [...aperti].sort((a, b) => a.data_acquisto.localeCompare(b.data_acquisto));

    const costoUnitarioMedioPonderato = info.metodo_costo === "media_ponderata"
      ? aperti.reduce((s, l) => s + l.quantita_residua * l.costo_unitario_eur, 0) /
        (aperti.reduce((s, l) => s + l.quantita_residua, 0) || 1)
      : 0;

    for (const lot of ordineChiusura) {
      if (daChiudere <= 1e-9) break;
      const chiusa = Math.min(daChiudere, lot.quantita_residua);
      const costoUnitario = info.metodo_costo === "media_ponderata" ? costoUnitarioMedioPonderato : lot.costo_unitario_eur;
      const costoEur = chiusa * costoUnitario;
      const ricavoEur = chiusa * ricavoUnitario;

      closures.push({
        lot_id: lot.id,
        vendita_movement_id: m.id,
        data_chiusura: m.data,
        quantita_chiusa: chiusa,
        costo_eur: costoEur,
        ricavo_eur: ricavoEur,
        plus_minus_eur: ricavoEur - costoEur,
        giorni_detenzione: giorniTra(lot.data_acquisto, m.data),
        categoria_compensazione: categoria,
      });

      lot.quantita_residua -= chiusa;
      if (lot.quantita_residua <= 1e-9) {
        lot.stato = "chiuso";
        lot.quantita_residua = 0; // elimina rumore di precisione float (es. 2.5e-16)
      }
      daChiudere -= chiusa;
    }

    if (daChiudere > 1e-9) {
      anomalie.push({ vendita_movement_id: m.id, quantita_non_coperta: daChiudere });
    }
  }

  return { lots, closures, anomalie };
}

// Motore di matching lotti — LIFO (azioni/obbligazioni/opzioni) o media ponderata
// (ETF/OICR, secondo tax_instruments.metodo_costo). Input: tax_movements di tipo
// 'acquisto'/'vendita' per un singolo strumento, gia' ordinati cronologicamente.
// Puro/testabile: nessuna dipendenza da Supabase, solo strutture dati in ingresso/uscita.
//
// Sicurezza anni gia' dichiarati: il motore stesso resta "full recompute" (rigenera
// sempre tutto in memoria da zero), ma gli id dei lotti sono RIUSATI da quelli gia'
// esistenti in DB (via lottiEsistenti, chiave = acquisto_movement_id) invece di essere
// rigenerati random. Questo permette al chiamante (edge function) di confrontare il
// risultato con lo stato attuale e RIFIUTARE la scrittura se un anno gia' dichiarato
// (tax_lot_closures.data_chiusura in un anno con dichiarazioni_fiscali.stato='presentata')
// risulterebbe diverso da quanto gia' registrato — vedi calcola-lotti-fiscali/index.ts.
//
// Opzioni esercitate/assegnate: il premio dovrebbe essere redistribuito sul lotto del
// sottostante (non creare una chiusura fiscale autonoma sull'opzione) — non ancora
// automatizzato: questi casi vengono comunque chiusi in modo standalone (come oggi) ma
// segnalati in anomalie con tipo 'esercizio_assegnazione_non_gestito', perche' il calcolo
// standalone e' probabilmente sbagliato e va rivisto a mano. Solo 'expiration' (scadenza
// worthless, verificata sul caso reale OKLO) e' considerato corretto cosi' com'e'.

export interface TaxMovementInput {
  id: string;
  tipo: "acquisto" | "vendita";
  data: string; // YYYY-MM-DD
  quantita: number; // con segno: positiva per acquisto, negativa per vendita
  importo_eur: number; // con segno: negativo per acquisto (uscita cassa), positivo per vendita (gia' netto commissioni)
  evento_opzione?: "exercise" | "assignment" | "expiration" | null;
}

export interface InstrumentTaxInfo {
  metodo_costo: "lifo" | "media_ponderata";
  is_titolo_stato_whitelist: boolean | null;
  is_oicr: boolean | null;
  classificazione_confermata: boolean;
}

export interface LotOutput {
  id: string;
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

export type Anomalia =
  | { tipo: "quantita_insufficiente"; vendita_movement_id: string; quantita_non_coperta: number }
  | { tipo: "esercizio_assegnazione_non_gestito"; vendita_movement_id: string; evento_opzione: "exercise" | "assignment" };

export interface EngineResult {
  lots: LotOutput[];
  closures: ClosureOutput[];
  anomalie: Anomalia[];
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
  lottiEsistenti?: Map<string, string>, // acquisto_movement_id -> id lotto gia' presente in DB
): EngineResult {
  // Tie-break per movimenti sullo stesso giorno solare: 'vendita' prima di 'acquisto'.
  // La tabella tax_movements non ha granularita' oraria (solo date), quindi non possiamo
  // sapere il vero ordine cronologico infragiornaliero — ma trattare le vendite come
  // "prima" nello stesso giorno e' la scelta piu' prudente/comune (evita di usare un
  // acquisto dello stesso giorno per coprire una vendita precedente, scenario tipico
  // "vendo poi reinvesto"). Scoperto un caso reale (OAT, riconciliazione OpenPosition,
  // vedi migration 0013) dove il vecchio tie-break per id casuale avrebbe allocato una
  // vendita su un acquisto dello stesso giorno eseguito DOPO, in modo economicamente
  // scorretto rispetto all'orario reale nell'XML.
  const ordinati = [...movimenti].sort((a, b) => {
    const perData = a.data.localeCompare(b.data);
    if (perData !== 0) return perData;
    if (a.tipo !== b.tipo) return a.tipo === "vendita" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const lots: LotOutput[] = [];
  const closures: ClosureOutput[] = [];
  const anomalie: Anomalia[] = [];
  const categoria = categoriaCompensazione(info);

  for (const m of ordinati) {
    if (m.tipo === "acquisto") {
      const quantitaOriginale = m.quantita;
      const costoTotale = Math.abs(m.importo_eur);
      lots.push({
        id: lottiEsistenti?.get(m.id) ?? nuovoId(),
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
    if (m.evento_opzione === "exercise" || m.evento_opzione === "assignment") {
      anomalie.push({ tipo: "esercizio_assegnazione_non_gestito", vendita_movement_id: m.id, evento_opzione: m.evento_opzione });
      // si prosegue comunque con la chiusura standalone sotto: meglio un numero probabilmente
      // impreciso ma segnalato, che nessun numero — la segnalazione in anomalie e' il segnale
      // che impedisce di trattarlo come dato affidabile senza revisione.
    }

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
      anomalie.push({ tipo: "quantita_insufficiente", vendita_movement_id: m.id, quantita_non_coperta: daChiudere });
    }
  }

  return { lots, closures, anomalie };
}

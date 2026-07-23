// Riconciliazione: posizioni aperte calcolate dal motore lotti (tax_lots, stato='aperto')
// vs snapshot OpenPosition di IBKR (posizioni_aperte_ibkr). Puro/testabile: nessuna
// dipendenza da Supabase.
//
// Serve a scoprire discrepanze tra ciò che il nostro motore ritiene ancora aperto e ciò
// che IBKR riporta davvero a fine periodo — es. un movimento mancante nel nostro backfill
// (caso reale: la vendita del T-bond USA del 2025-09-30, persa per una collisione di
// transactionID tra Trade e CashTransaction — vedi migration 0011). Confronta solo le
// QUANTITÀ (non i valori/prezzi): il valore di mercato dipende dal prezzo corrente, che
// non è compito del motore lotti calcolare in autonomia.

export interface LottoAperto {
  instrumentId: string;
  quantitaResidua: number;
}

export interface PosizioneIbkr {
  instrumentId: string | null; // risolto lato chiamante via isin/conid; null se nessun tax_instruments corrispondente
  conid: string;
  isin: string | null;
  symbol: string | null;
  position: number;
}

export type Divergenza =
  | { tipo: "solo_nostro"; instrumentId: string; quantitaNostra: number }
  | { tipo: "solo_ibkr"; instrumentId: string | null; conid: string; isin: string | null; symbol: string | null; quantitaIbkr: number }
  | { tipo: "quantita_divergente"; instrumentId: string; quantitaNostra: number; quantitaIbkr: number; differenza: number };

export interface RiconciliazioneResult {
  divergenze: Divergenza[];
  strumentiConcordanti: number;
}

const EPS = 1e-4;

export function riconcilia(lottiAperti: LottoAperto[], posizioni: PosizioneIbkr[]): RiconciliazioneResult {
  const nostroPerStrumento = new Map<string, number>();
  for (const l of lottiAperti) {
    nostroPerStrumento.set(l.instrumentId, (nostroPerStrumento.get(l.instrumentId) ?? 0) + l.quantitaResidua);
  }

  const ibkrPerStrumento = new Map<string, number>();
  const ibkrRifPerStrumento = new Map<string, PosizioneIbkr>();
  const divergenze: Divergenza[] = [];

  for (const p of posizioni) {
    if (p.instrumentId === null) {
      if (Math.abs(p.position) > EPS) {
        divergenze.push({ tipo: "solo_ibkr", instrumentId: null, conid: p.conid, isin: p.isin, symbol: p.symbol, quantitaIbkr: p.position });
      }
      continue;
    }
    ibkrPerStrumento.set(p.instrumentId, (ibkrPerStrumento.get(p.instrumentId) ?? 0) + p.position);
    ibkrRifPerStrumento.set(p.instrumentId, p);
  }

  let concordanti = 0;
  const strumentiVisti = new Set<string>();

  for (const [instrumentId, quantitaNostra] of nostroPerStrumento) {
    strumentiVisti.add(instrumentId);
    const quantitaIbkr = ibkrPerStrumento.get(instrumentId);
    if (quantitaIbkr === undefined) {
      if (Math.abs(quantitaNostra) > EPS) {
        divergenze.push({ tipo: "solo_nostro", instrumentId, quantitaNostra });
      }
      continue;
    }
    const differenza = quantitaNostra - quantitaIbkr;
    if (Math.abs(differenza) > EPS) {
      divergenze.push({ tipo: "quantita_divergente", instrumentId, quantitaNostra, quantitaIbkr, differenza });
    } else {
      concordanti++;
    }
  }

  for (const [instrumentId, quantitaIbkr] of ibkrPerStrumento) {
    if (strumentiVisti.has(instrumentId) || Math.abs(quantitaIbkr) <= EPS) continue;
    const rif = ibkrRifPerStrumento.get(instrumentId)!;
    divergenze.push({ tipo: "solo_ibkr", instrumentId, conid: rif.conid, isin: rif.isin, symbol: rif.symbol, quantitaIbkr });
  }

  return { divergenze, strumentiConcordanti: concordanti };
}

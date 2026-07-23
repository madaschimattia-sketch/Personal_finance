// Dettaglio quadro RW: righe "un prodotto estero per riga" (conid/ISIN, paese, valore
// inizio/fine periodo) da posizioni_aperte_ibkr — l'elenco di monitoraggio valutario
// vero e proprio, distinto dall'IVAFE (gia' calcolata in quadro-rw.ts). Puro/testabile.
//
// Chiave di merge: ISIN quando presente (stabile nel tempo), conid come fallback solo
// per strumenti senza ISIN (opzioni). IBKR puo' riassegnare il conid alla stessa
// posizione da un anno all'altro (osservato su un ETC reale: stesso ISIN, conid
// diverso tra fine 2024 e fine 2025, probabilmente per un cambio di listing/ticker) —
// usare solo conid avrebbe spezzato una posizione continua in due righe separate.
//
// Limite noto: cattura solo gli strumenti presenti in almeno uno dei due snapshot
// (fine anno precedente = inizio periodo, fine anno corrente = fine periodo). Uno
// strumento comprato E venduto interamente durante l'anno non compare in nessuno dei
// due snapshot — l'edge function lo individua separatamente dai tax_movements
// dell'anno e lo riporta a parte, perche' il possesso anche breve durante l'anno
// potrebbe comunque richiedere una riga RW (norma non del tutto univoca sul punto,
// da verificare col commercialista — vedi docs/decisioni-fiscali.md).

export interface PosizioneSnapshot {
  conid: string;
  isin: string | null;
  symbol: string | null;
  paeseCodice: string | null;
}

export interface PosizioneValoreSnapshot extends PosizioneSnapshot {
  positionValueEur: number;
}

export interface RigaRW {
  conid: string;
  isin: string | null;
  symbol: string | null;
  paeseCodice: string | null;
  valoreInizioEur: number | null; // null = non detenuto a inizio periodo (acquistato durante l'anno)
  valoreFineEur: number | null; // null = non detenuto a fine periodo (ceduto durante l'anno)
}

function chiaveMerge(p: PosizioneSnapshot): string {
  return p.isin ?? `conid:${p.conid}`;
}

export function costruisciDettaglioRW(
  posizioniInizio: PosizioneValoreSnapshot[],
  posizioniFine: PosizioneValoreSnapshot[],
): RigaRW[] {
  const righe = new Map<string, RigaRW>();

  for (const p of posizioniInizio) {
    righe.set(chiaveMerge(p), {
      conid: p.conid,
      isin: p.isin,
      symbol: p.symbol,
      paeseCodice: p.paeseCodice,
      valoreInizioEur: p.positionValueEur,
      valoreFineEur: null,
    });
  }

  for (const p of posizioniFine) {
    const chiave = chiaveMerge(p);
    const esistente = righe.get(chiave);
    if (esistente) {
      esistente.valoreFineEur = p.positionValueEur;
      esistente.conid = p.conid; // il conid puo' cambiare tra i due snapshot: tiene quello piu' recente
      esistente.symbol = p.symbol ?? esistente.symbol;
      esistente.paeseCodice = p.paeseCodice ?? esistente.paeseCodice;
    } else {
      righe.set(chiave, {
        conid: p.conid,
        isin: p.isin,
        symbol: p.symbol,
        paeseCodice: p.paeseCodice,
        valoreInizioEur: null,
        valoreFineEur: p.positionValueEur,
      });
    }
  }

  return [...righe.values()];
}

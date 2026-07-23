// Calcolo IVAFE (Imposta sul Valore delle Attivita' Finanziarie all'Estero, art. 19
// D.L. 201/2011) per il quadro RW. Puro/testabile: nessuna dipendenza da Supabase.
//
// Copre SOLO l'imposta (l'importo dovuto), non l'obbligo di monitoraggio (l'elenco
// riga per riga di ogni prodotto estero con ISIN/paese/valori richiesto dal quadro RW
// ai fini "antiriciclaggio"/monitoraggio valutario): quello richiederebbe lo snapshot
// posizioni di fine anno per singolo strumento (OpenPosition IBKR), non ancora
// ingerito in questo progetto — vedi ROADMAP.md. Qui si usa conto_nav_giornaliero
// (aggregato per asset class, gia' disponibile), sufficiente per calcolare l'imposta
// ma non per compilare le righe di dettaglio RW.
//
// Due componenti, calcolate separatamente:
// - Cash: regime FISSO (decisione in docs/decisioni-fiscali.md) — importo fisso
//   (analogo bollo conto corrente) se la giacenza media annua supera la soglia;
//   NON prorata per giorni di possesso (assunzione: il regime fisso non ha proroga
//   esplicita per il periodo di detenzione parziale, a differenza del regime
//   proporzionale — da confermare col commercialista se il conto e' stato aperto o
//   chiuso durante l'anno).
// - Titoli (azioni/obbligazioni/ETF/opzioni/altro non-cash): regime PROPORZIONALE
//   2 per mille (0,2%) sul valore all'ultima data disponibile nell'anno, prorato per
//   giorni di possesso nell'anno (apertura/chiusura conto durante l'anno riduce la
//   frazione, per l'art. 19 comma 18 D.L. 201/2011).

export interface NavSnapshotInput {
  reportDate: string; // YYYY-MM-DD, ultima data disponibile nell'anno (idealmente 31/12)
  titoliEur: number; // stock+bonds+options+funds+commodities+crypto alla reportDate
}

export interface GiacenzaMediaCashInput {
  giacenzaMediaCashEur: number;
}

export interface PeriodoDetenzione {
  giorniPossesso: number;
  giorniAnno: number; // 365 o 366
}

export interface Aliquote {
  ivafeProporzionalePct: number;
  ivafeCashFissaEur: number;
  ivafeCashSogliaGiacenzaMediaEur: number;
}

export interface TaxEventOutput {
  quadro: "RW";
  tipo: string;
  imponibile_eur: number;
  aliquota_pct: number | null;
  imposta_eur: number;
  note: string;
}

export function calcolaIvafe(
  nav: NavSnapshotInput | null,
  giacenzaMedia: GiacenzaMediaCashInput | null,
  periodo: PeriodoDetenzione,
  aliquote: Aliquote,
): TaxEventOutput[] {
  const eventi: TaxEventOutput[] = [];
  const frazioneAnno = Math.min(1, Math.max(0, periodo.giorniPossesso / periodo.giorniAnno));

  if (giacenzaMedia && giacenzaMedia.giacenzaMediaCashEur > aliquote.ivafeCashSogliaGiacenzaMediaEur) {
    eventi.push({
      quadro: "RW",
      tipo: "ivafe_cash_fissa",
      imponibile_eur: giacenzaMedia.giacenzaMediaCashEur,
      aliquota_pct: null,
      imposta_eur: aliquote.ivafeCashFissaEur,
      note: `Giacenza media cassa ${giacenzaMedia.giacenzaMediaCashEur.toFixed(2)} EUR, sopra la soglia di `
        + `${aliquote.ivafeCashSogliaGiacenzaMediaEur.toFixed(2)} EUR: imposta fissa (regime bollo conto corrente), `
        + `non prorata per giorni di possesso.`,
    });
  }

  if (nav && nav.titoliEur > 1e-9) {
    const imposta = (nav.titoliEur * aliquote.ivafeProporzionalePct / 100) * frazioneAnno;
    eventi.push({
      quadro: "RW",
      tipo: "ivafe_proporzionale_titoli",
      imponibile_eur: nav.titoliEur,
      aliquota_pct: aliquote.ivafeProporzionalePct,
      imposta_eur: imposta,
      note: `Valore titoli al ${nav.reportDate}: ${nav.titoliEur.toFixed(2)} EUR. `
        + `${periodo.giorniPossesso}/${periodo.giorniAnno} giorni di possesso nell'anno `
        + `(frazione ${(frazioneAnno * 100).toFixed(1)}%).`,
    });
  }

  return eventi;
}

export function giorniAnno(anno: number): number {
  const bisestile = (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
  return bisestile ? 366 : 365;
}

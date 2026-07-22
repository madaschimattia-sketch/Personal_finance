// Aggregazione quadro RT (redditi diversi di natura finanziaria, art. 67 TUIR) da
// tax_lot_closures. Puro/testabile: nessuna dipendenza da Supabase.
//
// Logica (art. 68 TUIR): plus/minus si compensano SOLO all'interno della stessa
// categoria_compensazione (gia' calcolata dal motore lotti, vedi lot-matching.ts):
// - 'ordinaria' (26%) e 'whitelist' (12,5%): saldo netto dell'anno; se positivo,
//   consuma prima le minusvalenze pregresse riportabili (tax_loss_carryforward,
//   FIFO per anno_origine cosi' si usano quelle piu' vicine alla scadenza dei 4
//   anni); se negativo, genera un nuovo riporto.
// - 'oicr_non_compensabile': le plusvalenze sono SEMPRE imponibili in pieno (nessun
//   utilizzo di minusvalenze, ne' correnti ne' pregresse); le minusvalenze non
//   generano riporto (nessuna riga tax_loss_carryforward — coerente con lo schema
//   attuale, che ammette solo categoria 'ordinaria'/'whitelist'). NOTA: la reale
//   compensabilita' delle minus da OICR "armonizzati" (UCITS) con altre categorie
//   di redditi diversi e' un punto di diritto tributario non banale (regime
//   unificato post D.L. 138/2011) — qui si segue la separazione gia' incorporata
//   nello schema (decisione presa prima di questa sessione), NON una conferma
//   legale: da rivedere col commercialista, vedi docs/decisioni-fiscali.md.
// - Chiusure con categoria_compensazione NULL (classificazione_confermata=false
//   sullo strumento) sono ESCLUSE dal calcolo e riportate a parte: non si include
//   mai nel quadro un dato non confermato.

export type Categoria = "ordinaria" | "whitelist";

export interface ClosureInput {
  id: string;
  categoria_compensazione: Categoria | "oicr_non_compensabile" | null;
  plus_minus_eur: number;
}

export interface CarryforwardInput {
  id: string;
  anno_origine: number;
  categoria: Categoria;
  importo_residuo_eur: number;
}

export interface Aliquote {
  ordinaria_pct: number;
  whitelist_pct: number;
}

export interface TaxEventOutput {
  quadro: "RT";
  tipo: string;
  imponibile_eur: number;
  aliquota_pct: number | null;
  imposta_eur: number;
  note: string;
}

export interface CarryforwardConsumo {
  id: string;
  importo_residuo_eur: number; // nuovo valore residuo dopo il consumo
}

export interface CarryforwardNuovo {
  categoria: Categoria;
  importo_originario_eur: number;
  importo_residuo_eur: number;
}

export interface QuadroRTResult {
  eventi: TaxEventOutput[];
  carryforwardConsumati: CarryforwardConsumo[];
  carryforwardNuovi: CarryforwardNuovo[];
  chiusureNonClassificate: number;
}

function somma(chiusure: ClosureInput[], pred: (v: number) => boolean): number {
  return chiusure.filter((c) => pred(c.plus_minus_eur)).reduce((s, c) => s + Math.abs(c.plus_minus_eur), 0);
}

function calcolaCategoriaOrdinariaWhitelist(
  categoria: Categoria,
  chiusure: ClosureInput[],
  carryforwardEsistenti: CarryforwardInput[],
  aliquotaPct: number,
): { eventi: TaxEventOutput[]; carryforwardConsumati: CarryforwardConsumo[]; carryforwardNuovi: CarryforwardNuovo[] } {
  const plus = somma(chiusure, (v) => v > 0);
  const minus = somma(chiusure, (v) => v < 0);
  const saldo = plus - minus;

  const eventi: TaxEventOutput[] = [];
  const carryforwardConsumati: CarryforwardConsumo[] = [];
  const carryforwardNuovi: CarryforwardNuovo[] = [];

  if (saldo > 1e-9) {
    const disponibili = carryforwardEsistenti
      .filter((c) => c.categoria === categoria && c.importo_residuo_eur > 1e-9)
      .sort((a, b) => a.anno_origine - b.anno_origine); // FIFO: piu' vicine alla scadenza prima

    let residuoDaCompensare = saldo;
    let totaleConsumato = 0;
    for (const cf of disponibili) {
      if (residuoDaCompensare <= 1e-9) break;
      const consumo = Math.min(residuoDaCompensare, cf.importo_residuo_eur);
      carryforwardConsumati.push({ id: cf.id, importo_residuo_eur: cf.importo_residuo_eur - consumo });
      residuoDaCompensare -= consumo;
      totaleConsumato += consumo;
    }

    const imponibile = Math.max(0, residuoDaCompensare);
    const imposta = (imponibile * aliquotaPct) / 100;
    eventi.push({
      quadro: "RT",
      tipo: `plusvalenza_${categoria}`,
      imponibile_eur: imponibile,
      aliquota_pct: aliquotaPct,
      imposta_eur: imposta,
      note: `Plusvalenze lorde ${plus.toFixed(2)} EUR, minusvalenze lorde dell'anno ${minus.toFixed(2)} EUR, saldo ${saldo.toFixed(2)} EUR, minusvalenze pregresse compensate ${totaleConsumato.toFixed(2)} EUR.`,
    });
  } else if (saldo < -1e-9) {
    const importo = Math.abs(saldo);
    carryforwardNuovi.push({ categoria, importo_originario_eur: importo, importo_residuo_eur: importo });
    eventi.push({
      quadro: "RT",
      tipo: `minusvalenza_${categoria}_riportata`,
      imponibile_eur: 0,
      aliquota_pct: null,
      imposta_eur: 0,
      note: `Minusvalenza netta dell'anno ${importo.toFixed(2)} EUR (plus ${plus.toFixed(2)}, minus ${minus.toFixed(2)}), riportabile nei 4 anni successivi.`,
    });
  } else if (chiusure.length > 0) {
    eventi.push({
      quadro: "RT",
      tipo: `pareggio_${categoria}`,
      imponibile_eur: 0,
      aliquota_pct: null,
      imposta_eur: 0,
      note: `Plusvalenze e minusvalenze dell'anno si compensano esattamente (${plus.toFixed(2)} EUR).`,
    });
  }

  return { eventi, carryforwardConsumati, carryforwardNuovi };
}

export function calcolaQuadroRT(
  chiusure: ClosureInput[],
  carryforwardEsistenti: CarryforwardInput[],
  aliquote: Aliquote,
): QuadroRTResult {
  const classificate = chiusure.filter((c) => c.categoria_compensazione !== null);
  const chiusureNonClassificate = chiusure.length - classificate.length;

  const ordinarie = classificate.filter((c) => c.categoria_compensazione === "ordinaria");
  const whitelist = classificate.filter((c) => c.categoria_compensazione === "whitelist");
  const oicr = classificate.filter((c) => c.categoria_compensazione === "oicr_non_compensabile");

  const rOrdinaria = calcolaCategoriaOrdinariaWhitelist("ordinaria", ordinarie, carryforwardEsistenti, aliquote.ordinaria_pct);
  const rWhitelist = calcolaCategoriaOrdinariaWhitelist("whitelist", whitelist, carryforwardEsistenti, aliquote.whitelist_pct);

  const eventi: TaxEventOutput[] = [...rOrdinaria.eventi, ...rWhitelist.eventi];
  const carryforwardConsumati = [...rOrdinaria.carryforwardConsumati, ...rWhitelist.carryforwardConsumati];
  const carryforwardNuovi = [...rOrdinaria.carryforwardNuovi, ...rWhitelist.carryforwardNuovi];

  const plusOicr = somma(oicr, (v) => v > 0);
  const minusOicr = somma(oicr, (v) => v < 0);
  if (plusOicr > 1e-9) {
    const imposta = (plusOicr * aliquote.ordinaria_pct) / 100;
    eventi.push({
      quadro: "RT",
      tipo: "plusvalenza_oicr",
      imponibile_eur: plusOicr,
      aliquota_pct: aliquote.ordinaria_pct,
      imposta_eur: imposta,
      note: "Provento OICR (redditi di capitale): imponibile in pieno, nessuna compensazione con minusvalenze correnti o pregresse.",
    });
  }
  if (minusOicr > 1e-9) {
    eventi.push({
      quadro: "RT",
      tipo: "minusvalenza_oicr_non_compensabile",
      imponibile_eur: 0,
      aliquota_pct: null,
      imposta_eur: 0,
      note: `Minusvalenza OICR dell'anno ${minusOicr.toFixed(2)} EUR: non compensabile e non riportabile secondo la classificazione attuale — da rivedere col commercialista (vedi docs/decisioni-fiscali.md).`,
    });
  }

  return { eventi, carryforwardConsumati, carryforwardNuovi, chiusureNonClassificate };
}

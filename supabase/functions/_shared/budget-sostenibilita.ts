// Motore di sostenibilità costi fissi vs reddito (Fase 4 — BUDGET). Puro/testabile:
// nessuna dipendenza da Supabase.
//
// Scope deciso con l'utente: NON traccia la spesa variabile (niente estratto conto/
// carta) — lavora solo su costi fissi (utenze_bollette) vs reddito (introiti_buste_paga),
// per capire se i costi fissi sono sostenibili nel lungo periodo e come allocare il
// margine (fondo emergenza poi risparmio/investimento). Mai raccomandazioni di prodotto
// specifico — resta fuori dal perimetro della consulenza regolata.
//
// Reddito ricorrente = MEDIANA dei netti mensili, non la media: robusta ai mesi con
// bonus/premi/STI e alla tredicesima (una minoranza di righe su un totale di ~35-40),
// senza bisogno di classificarli esplicitamente come "bonus". La media (che include
// bonus e tredicesima) resta calcolata a parte come "reddito medio annualizzato", per
// dare il quadro completo.

export interface BollettaInput {
  categoria: string;
  importo: number;
  frequenza: string | null;
}

export interface BustaPagaInput {
  periodoDa: string; // YYYY-MM-DD
  netto: number;
}

export interface ParametriSostenibilita {
  sogliaSostenibilePct: number;
  sogliaAttenzionePct: number;
  targetMesiFondoEmergenzaMin: number;
  targetMesiFondoEmergenzaMax: number;
}

export type Giudizio = "sostenibile" | "attenzione" | "rischio";

export interface CostoCategoria {
  categoria: string;
  costoMensileEquivalente: number;
  numeroRighe: number;
}

export interface RisultatoSostenibilita {
  costiFissiMensiliTotali: number;
  costiPerCategoria: CostoCategoria[];
  redditoRicorrenteMensile: number;
  redditoMedioAnnualizzato: number;
  rapportoPct: number;
  giudizio: Giudizio;
  margineMensile: number;
  fondoEmergenzaTargetMinEur: number;
  fondoEmergenzaTargetMaxEur: number;
  trend: {
    rapportoPctPrimaMeta: number | null;
    rapportoPctSecondaMeta: number | null;
    direzione: "migliora" | "peggiora" | "stabile" | "dati_insufficienti";
  };
  righeBolletteEscluse: number; // frequenza null o 'una_tantum', escluse dal calcolo
}

const MESI_PER_FREQUENZA: Record<string, number> = {
  mensile: 1,
  bimestrale: 2,
  trimestrale: 3,
  semestrale: 6,
  annuale: 12,
};

function mediana(valori: number[]): number {
  if (valori.length === 0) return 0;
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 === 0 ? (ordinati[meta - 1] + ordinati[meta]) / 2 : ordinati[meta];
}

function media(valori: number[]): number {
  if (valori.length === 0) return 0;
  return valori.reduce((s, v) => s + v, 0) / valori.length;
}

function giudica(rapportoPct: number, parametri: ParametriSostenibilita): Giudizio {
  if (rapportoPct <= parametri.sogliaSostenibilePct) return "sostenibile";
  if (rapportoPct <= parametri.sogliaAttenzionePct) return "attenzione";
  return "rischio";
}

function costiPerCategoria(bollette: BollettaInput[]): { costi: CostoCategoria[]; escluse: number } {
  const perCategoria = new Map<string, number[]>();
  let escluse = 0;
  for (const b of bollette) {
    const mesi = b.frequenza ? MESI_PER_FREQUENZA[b.frequenza] : undefined;
    if (!mesi) {
      escluse += 1;
      continue;
    }
    const mensileEquivalente = b.importo / mesi;
    const arr = perCategoria.get(b.categoria) ?? [];
    arr.push(mensileEquivalente);
    perCategoria.set(b.categoria, arr);
  }
  const costi = [...perCategoria.entries()].map(([categoria, valori]) => ({
    categoria,
    costoMensileEquivalente: media(valori),
    numeroRighe: valori.length,
  }));
  return { costi, escluse };
}

export function calcolaSostenibilita(
  bollette: BollettaInput[],
  bustePaga: BustaPagaInput[],
  parametri: ParametriSostenibilita,
): RisultatoSostenibilita {
  const { costi, escluse } = costiPerCategoria(bollette);
  const costiFissiMensiliTotali = costi.reduce((s, c) => s + c.costoMensileEquivalente, 0);

  const netti = bustePaga.map((b) => b.netto);
  const redditoRicorrenteMensile = mediana(netti);
  const redditoMedioAnnualizzato = media(netti);

  const rapportoPct = redditoRicorrenteMensile > 0
    ? (costiFissiMensiliTotali / redditoRicorrenteMensile) * 100
    : 0;
  const giudizio = giudica(rapportoPct, parametri);
  const margineMensile = redditoRicorrenteMensile - costiFissiMensiliTotali;

  // Trend: confronta il rapporto costi/reddito tra prima e seconda metà del periodo
  // osservato (per data busta paga), usando solo il reddito (i costi fissi restano
  // l'unica media disponibile, non abbastanza granulare da spezzare in due metà
  // significative con pochi mesi di dati per categoria).
  const bustePagaOrdinate = [...bustePaga].sort((a, b) => a.periodoDa.localeCompare(b.periodoDa));
  const metaIdx = Math.floor(bustePagaOrdinate.length / 2);
  const primaMeta = bustePagaOrdinate.slice(0, metaIdx);
  const secondaMeta = bustePagaOrdinate.slice(metaIdx);
  const redditoPrimaMeta = primaMeta.length > 0 ? mediana(primaMeta.map((b) => b.netto)) : null;
  const redditoSecondaMeta = secondaMeta.length > 0 ? mediana(secondaMeta.map((b) => b.netto)) : null;
  const rapportoPctPrimaMeta = redditoPrimaMeta && redditoPrimaMeta > 0 ? (costiFissiMensiliTotali / redditoPrimaMeta) * 100 : null;
  const rapportoPctSecondaMeta = redditoSecondaMeta && redditoSecondaMeta > 0 ? (costiFissiMensiliTotali / redditoSecondaMeta) * 100 : null;

  let direzione: RisultatoSostenibilita["trend"]["direzione"] = "dati_insufficienti";
  if (rapportoPctPrimaMeta !== null && rapportoPctSecondaMeta !== null) {
    const diff = rapportoPctSecondaMeta - rapportoPctPrimaMeta;
    direzione = Math.abs(diff) < 2 ? "stabile" : diff < 0 ? "migliora" : "peggiora";
  }

  return {
    costiFissiMensiliTotali,
    costiPerCategoria: costi,
    redditoRicorrenteMensile,
    redditoMedioAnnualizzato,
    rapportoPct,
    giudizio,
    margineMensile,
    fondoEmergenzaTargetMinEur: costiFissiMensiliTotali * parametri.targetMesiFondoEmergenzaMin,
    fondoEmergenzaTargetMaxEur: costiFissiMensiliTotali * parametri.targetMesiFondoEmergenzaMax,
    trend: { rapportoPctPrimaMeta, rapportoPctSecondaMeta, direzione },
    righeBolletteEscluse: escluse,
  };
}

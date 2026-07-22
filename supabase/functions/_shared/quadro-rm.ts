// Aggregazione quadro RM Sezione V (redditi di capitale di fonte estera, art. 44/45
// TUIR: dividendi, interessi, cedole obbligazionarie) da tax_movements. Puro/testabile:
// nessuna dipendenza da Supabase.
//
// A differenza del quadro RT, qui NON esiste compensazione: ogni provento e' imponibile
// per intero, non ci sono minusvalenze ne' riporti. L'unico meccanismo di riduzione e'
// il credito d'imposta per le ritenute subite alla fonte estera (movimenti tipo
// 'ritenuta' in tax_movements) — IBKR non e' un sostituto d'imposta italiano, quindi
// tutto il reddito di capitale percepito va autoliquidato via RM con imposta sostitutiva
// (26% ordinaria, 12,5% per cedole di titoli di stato whitelist) al netto del credito.
//
// Distinzione whitelist/ordinaria: si applica SOLO alle cedole di titoli di stato
// whitelist (tax_instruments.is_titolo_stato_whitelist). Dividendi/proventi da OICR non
// hanno un trattamento speciale in RM (a differenza di RT): sono redditi di capitale
// come qualunque altro dividendo, aliquota ordinaria 26%.
//
// Credito d'imposta estero: qui e' limitato (non asserito senza riserva) al minore tra
// la ritenuta subita e l'imposta italiana lorda dovuta sulla stessa categoria — una
// semplificazione prudente: se la ritenuta eccede l'imposta lorda, l'eccedenza NON viene
// usata (non si assume che sia rimborsabile/riportabile senza conferma del
// commercialista, vedi docs/decisioni-fiscali.md). Il matching ritenuta<->provento e'
// per categoria/anno aggregato, non riga per riga (tax_movements non ha un FK esplicito
// dalla ritenuta al provento che l'ha generata).

export type Categoria = "ordinaria" | "whitelist";

export interface RedditoCapitaleInput {
  id: string;
  categoria: Categoria | null; // null = strumento non classificato (o dato mancante), escluso
  importo_eur: number; // positivo
}

export interface RitenutaInput {
  id: string;
  categoria: Categoria | null;
  importo_eur: number; // valore assoluto della ritenuta subita
}

export interface Aliquote {
  ordinaria_pct: number;
  whitelist_pct: number;
}

export interface TaxEventOutput {
  quadro: "RM";
  tipo: string;
  imponibile_eur: number;
  aliquota_pct: number | null;
  imposta_eur: number;
  note: string;
}

export interface QuadroRMResult {
  eventi: TaxEventOutput[];
  redditiNonClassificati: number;
  ritenuteNonClassificate: number;
}

function calcolaCategoria(
  categoria: Categoria,
  redditi: RedditoCapitaleInput[],
  ritenute: RitenutaInput[],
  aliquotaPct: number,
): TaxEventOutput[] {
  const daCategoria = redditi.filter((r) => r.categoria === categoria);
  const imponibileLordo = daCategoria.reduce((s, r) => s + r.importo_eur, 0);
  if (imponibileLordo <= 1e-9) return [];

  const impostaLorda = (imponibileLordo * aliquotaPct) / 100;
  const creditoLordo = ritenute.filter((r) => r.categoria === categoria).reduce((s, r) => s + r.importo_eur, 0);
  const creditoUtilizzato = Math.min(creditoLordo, impostaLorda);
  const impostaNetta = impostaLorda - creditoUtilizzato;
  const eccedenza = creditoLordo - creditoUtilizzato;

  return [{
    quadro: "RM",
    tipo: `reddito_capitale_${categoria}`,
    imponibile_eur: imponibileLordo,
    aliquota_pct: aliquotaPct,
    imposta_eur: impostaNetta,
    note: `Imponibile lordo ${imponibileLordo.toFixed(2)} EUR, imposta lorda ${impostaLorda.toFixed(2)} EUR, `
      + `credito d'imposta estero utilizzato ${creditoUtilizzato.toFixed(2)} EUR (ritenute subite ${creditoLordo.toFixed(2)} EUR).`
      + (eccedenza > 1e-9
        ? ` Eccedenza di credito non utilizzata in questo calcolo: ${eccedenza.toFixed(2)} EUR — da verificare col commercialista se recuperabile altrove.`
        : ""),
  }];
}

export function calcolaQuadroRM(
  redditi: RedditoCapitaleInput[],
  ritenute: RitenutaInput[],
  aliquote: Aliquote,
): QuadroRMResult {
  const redditiClassificati = redditi.filter((r) => r.categoria !== null);
  const ritenuteClassificate = ritenute.filter((r) => r.categoria !== null);

  const eventi = [
    ...calcolaCategoria("ordinaria", redditiClassificati, ritenuteClassificate, aliquote.ordinaria_pct),
    ...calcolaCategoria("whitelist", redditiClassificati, ritenuteClassificate, aliquote.whitelist_pct),
  ];

  return {
    eventi,
    redditiNonClassificati: redditi.length - redditiClassificati.length,
    ritenuteNonClassificate: ritenute.length - ritenuteClassificate.length,
  };
}

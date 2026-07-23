// Motore fondi pensione (previdenza complementare, D.Lgs 252/2005). Puro/testabile:
// nessuna dipendenza da Supabase.
//
// Copre SOLO la deduzione dei versamenti (quadro RP / oneri deducibili, art. 10 c.1
// lett. e-bis TUIR): tetto annuo 5.164,57 EUR (config_fiscale_parametri), eccedenza
// non deducibile che va tracciata (esente da tassazione al momento del riscatto — non
// e' un dettaglio trascurabile, art. 11 D.Lgs 252/2005). Le altre due componenti del
// dominio fondi pensione restano fuori scope qui, per design:
// - imposta sostitutiva sul rendimento: gia' trattenuta dal fondo, nessun calcolo
//   nostro necessario;
// - tassazione in uscita: rilevante solo a un riscatto/rendita effettivo, non ancora
//   accaduto per nessun fondo in questo progetto. La funzione aliquotaTassazioneUscita
//   e' comunque implementata qui (pura, pronta all'uso) per quando servira'.

export interface VersamentoInput {
  id: string;
  annoCompetenza: number;
  importoEur: number;
  deducibile: boolean;
}

export interface DeduzioneResult {
  annoCompetenza: number;
  versamentiDeducibiliLordi: number; // somma dei versamenti con deducibile=true
  importoDeducibile: number; // min(versamentiDeducibiliLordi, tetto)
  eccedenzaNonDeducibile: number; // versamentiDeducibiliLordi - importoDeducibile, se >0
}

export function calcolaDeduzioneVersamenti(
  versamenti: VersamentoInput[],
  anno: number,
  tettoEur: number,
): DeduzioneResult {
  const versamentiDeducibiliLordi = versamenti
    .filter((v) => v.annoCompetenza === anno && v.deducibile)
    .reduce((s, v) => s + v.importoEur, 0);

  const importoDeducibile = Math.min(versamentiDeducibiliLordi, tettoEur);
  const eccedenzaNonDeducibile = Math.max(0, versamentiDeducibiliLordi - tettoEur);

  return { annoCompetenza: anno, versamentiDeducibiliLordi, importoDeducibile, eccedenzaNonDeducibile };
}

// Aliquota sostitutiva sulla prestazione in uscita (riscatto/rendita), art. 11 comma 6
// D.Lgs 252/2005: 15% fino a 15 anni di iscrizione, poi -0,3 punti percentuali per ogni
// anno oltre il 15simo, fino a un minimo del 9% (raggiunto a 35 anni di iscrizione).
// Non ancora usata da nessuna edge function: nessun riscatto reale e' avvenuto finora.
export function aliquotaTassazioneUscita(anniIscrizione: number): number {
  if (anniIscrizione <= 15) return 15;
  const riduzione = 0.3 * (anniIscrizione - 15);
  return Math.max(9, 15 - riduzione);
}

import { quotaContoGenerico, caricaPosizioniContoGenerico } from "./contoGenerico.js";

// Conto Banca Generali: 100% Mattia, regime amministrato (vedi contoGenerico.js
// per la logica condivisa di quota/aggregazione usata da tutti i conti di
// questo tipo — Banca Generali, Widiba, e i prossimi).
export async function quotaBancaGenerali(intestatarioId) {
  return quotaContoGenerico("Banca Generali", intestatarioId);
}

export async function caricaPosizioniBancaGenerali(intestatarioId) {
  return caricaPosizioniContoGenerico("Banca Generali", intestatarioId);
}

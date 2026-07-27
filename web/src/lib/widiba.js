import { quotaContoGenerico, caricaPosizioniContoGenerico } from "./contoGenerico.js";

// Conto Widiba: 100% Mattia, regime amministrato. Alcune posizioni sono
// arrivate come trasferimento titoli da un conto esterno non tracciato in
// quest'app ("Carico"/"Carico giro deposito" nell'export Widiba): su
// indicazione dell'utente sono registrate in `movimenti` come acquisti
// normali (costo = prezzo del trasferimento, convertito in EUR con il
// cambio storico ECB del giorno per gli USD — nessun esborso reale da
// Widiba, ma il costo storico va comunque tracciato per calcolare il P&L).
// Le coppie "Apertura vincolo"/"Chiusura vincolo" (stesso giorno, stessa
// quantità) sono un non-evento di custodia e non sono state importate.
// Nessuno snapshot posizioni attuali disponibile per questo conto (a
// differenza di Banca Generali, qui non c'è un dossier XLS con i prezzi):
// valoreAttuale resta null finché non verrà caricato uno snapshot.
export async function quotaWidiba(intestatarioId) {
  return quotaContoGenerico("Widiba", intestatarioId);
}

export async function caricaPosizioniWidiba(intestatarioId) {
  return caricaPosizioniContoGenerico("Widiba", intestatarioId);
}

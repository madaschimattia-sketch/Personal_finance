import { quotaContoGenerico, caricaPosizioniContoGenerico } from "./contoGenerico.js";

// Conto BG Saxo: 100% Mattia, regime amministrato (conferma diretta nei dati:
// ritenuta automatica "Imposta nazionale sulle plusvalenze" su una vendita in
// guadagno). È il conto esterno da cui sono stati trasferiti a Widiba (22/01/2026)
// Oklo/Nvidia/Nano Nuclear — il costo storico di quei 3 trasferimenti in
// lib/widiba.js è stato corretto usando il costo reale ricostruito qui, al
// posto della stima iniziale via cambio ECB.
export async function quotaBgSaxo(intestatarioId) {
  return quotaContoGenerico("BG Saxo", intestatarioId);
}

export async function caricaPosizioniBgSaxo(intestatarioId) {
  return caricaPosizioniContoGenerico("BG Saxo", intestatarioId);
}

import { supabase } from "./supabase.js";

// Il conto IBKR è cointestato (conto_intestatari.quota_percentuale, vedi migration
// 0041/0042): ogni pagina che legge conto_nav_giornaliero/posizioni_aperte_ibkr/
// tax_lots deve scalare i valori alla quota dell'intestatario selezionato, altrimenti
// mostra per intero un patrimonio condiviso. Unica fonte di verità per questa query
// (usata da Dashboard/Portafoglio/Proiezioni).
//
// Scoped esplicitamente a broker='IBKR': da quando esiste un secondo conto attivo
// (Banca Generali, vedi lib/bancaGenerali.js) un filtro solo su attivo=true non
// identifica più un conto univoco — bug reale trovato e corretto qui prima di
// aggiungere quel secondo conto.
export async function quotaContoIbkr(intestatarioId) {
  const { data: conto } = await supabase.from("conti").select("id").eq("attivo", true).eq("broker", "IBKR").limit(1).maybeSingle();
  if (!conto) return 1;
  // Legge TUTTE le quote del conto, non solo quella dell'intestatario richiesto:
  // se il conto ha righe configurate ma nessuna per questo intestatario, la sua
  // quota è 0 (es. Martina, che non è cointestataria dell'IBKR) — non 100%. Il
  // fallback a 100% vale solo se il conto non ha ALCUNA riga in conto_intestatari
  // (cointestazione mai configurata, comportamento storico pre-migration 0041).
  const { data: righeConto } = await supabase.from("conto_intestatari")
    .select("intestatario_id, quota_percentuale").eq("conto_id", conto.id);
  if (!righeConto || righeConto.length === 0) return 1;
  const riga = righeConto.find((r) => r.intestatario_id === intestatarioId);
  return riga ? Number(riga.quota_percentuale) / 100 : 0;
}

import { supabase } from "./supabase.js";

// Un domicilio può essere cointestato (domicilio_intestatari.quota_percentuale):
// tutte le bollette di quel domicilio vanno scalate alla quota dell'intestatario
// selezionato, altrimenti mostrano per intero un costo condiviso. Ritorna una
// Map<domicilio_id, {quota, altri}> — "altri" serve per la nota in UI (nome +
// quota degli altri cointestatari), letta una volta sola per tutti i domicili.
export async function caricaQuoteDomicili(intestatarioId) {
  const { data, error } = await supabase
    .from("domicilio_intestatari")
    .select("domicilio_id, intestatario_id, quota_percentuale");
  if (error) throw error;

  const righePerDomicilio = new Map();
  for (const r of data ?? []) {
    const arr = righePerDomicilio.get(r.domicilio_id) ?? [];
    arr.push(r);
    righePerDomicilio.set(r.domicilio_id, arr);
  }

  const risultato = new Map();
  for (const [domicilioId, righe] of righePerDomicilio) {
    // Righe presenti ma nessuna per questo intestatario → quota 0 (non 100%:
    // stesso fix già applicato a quotaContoIbkr/caricaSpeseFisseConQuota).
    const mia = righe.find((r) => r.intestatario_id === intestatarioId);
    const quota = mia ? Number(mia.quota_percentuale) / 100 : 0;
    const altri = righe.filter((r) => r.intestatario_id !== intestatarioId);
    risultato.set(domicilioId, { quota, altri });
  }
  return risultato;
}

// Default per un domicilio senza alcuna riga in domicilio_intestatari
// (cointestazione mai configurata — comportamento storico, 100% legacy).
export const QUOTA_DOMICILIO_DEFAULT = { quota: 1, altri: [] };

import { supabase } from "./supabase.js";

// Ogni spesa fissa manuale può essere cointestata (spesa_fissa_intestatari.quota_percentuale,
// stesso pattern di conto_intestatari/domicilio_intestatari — niente più intestatario_id
// singolo sulla riga padre). Helper condiviso da Veicolo/Persona/Casa (assicurazione_casa).
export async function caricaSpeseFisseConQuota(categorie, intestatarioId, intestatari) {
  const { data: spese, error: erroreSpese } = await supabase
    .from("spese_fisse_manuali")
    .select("id, nome, categoria, importo, frequenza, attivo, data_inizio")
    .in("categoria", categorie)
    .order("categoria");
  if (erroreSpese) throw erroreSpese;

  const ids = (spese ?? []).map((s) => s.id);
  let righeQuota = [];
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("spesa_fissa_intestatari")
      .select("spesa_id, intestatario_id, quota_percentuale")
      .in("spesa_id", ids);
    if (error) throw error;
    righeQuota = data ?? [];
  }

  const righePerSpesa = new Map();
  for (const r of righeQuota) {
    const arr = righePerSpesa.get(r.spesa_id) ?? [];
    arr.push(r);
    righePerSpesa.set(r.spesa_id, arr);
  }

  const risultato = [];
  for (const s of spese ?? []) {
    const righe = righePerSpesa.get(s.id) ?? [];
    // Nessuna riga configurata → 100% legacy (non dovrebbe succedere dopo il
    // backfill, ma è la stessa regola difensiva di quotaContoIbkr). Righe
    // presenti ma nessuna per questo intestatario → quota 0, spesa esclusa
    // (non mostrata a zero).
    const mia = righe.find((r) => r.intestatario_id === intestatarioId);
    const quota = righe.length === 0 ? 1 : (mia ? Number(mia.quota_percentuale) / 100 : 0);
    if (quota === 0) continue;

    const altri = righe.filter((r) => r.intestatario_id !== intestatarioId);
    const notaCointestazione = altri.length > 0
      ? `Cointestato con ${altri.map((a) => {
          const i = intestatari.find((x) => x.id === a.intestatario_id);
          return `${i?.nome ?? "?"} (${Number(a.quota_percentuale)}%)`;
        }).join(", ")}`
      : null;

    risultato.push({ ...s, importo: Number(s.importo) * quota, notaCointestazione });
  }
  return risultato;
}

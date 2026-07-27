// Il conto IBKR e' cointestato al 50% con Marco Lazzarini (conto_intestatari.
// quota_percentuale, vedi migration 0041/0042): i quadri fiscali (RT/RM/RW) vanno
// calcolati solo sulla quota di proprieta' dell'utente dell'app (l'intestatario con
// relazione='io', cioe' Mattia), non sull'intero conto condiviso — altrimenti si
// dichiarerebbero anche le plusvalenze/interessi/IVAFE della meta' di Marco. Stessa
// logica di web/src/lib/conto.js (frontend), qui lato edge function per i calcoli
// che scrivono su tax_events.
//
// Oggi c'e' un solo conto attivo: RT/RM sono aggregati per utente su tutti i conti
// (la dichiarazione e' unica), quindi una quota unica basta. Se in futuro ci
// fossero piu' conti con quote diverse, RT/RM andrebbero rivisti per pesare ogni
// chiusura/movimento sul proprio conto_id invece di applicare una quota globale.
export async function quotaContoProprietario(admin: any, userId: string): Promise<number> {
  const { data: intestatario } = await admin.from("intestatari").select("id").eq("user_id", userId).eq("relazione", "io").maybeSingle();
  if (!intestatario) return 1;
  const { data: conto } = await admin.from("conti").select("id").eq("user_id", userId).eq("attivo", true).limit(1).maybeSingle();
  if (!conto) return 1;
  const { data: righe } = await admin.from("conto_intestatari").select("intestatario_id, quota_percentuale").eq("conto_id", conto.id);
  if (!righe || righe.length === 0) return 1;
  const riga = righe.find((r: { intestatario_id: string }) => r.intestatario_id === intestatario.id);
  return riga ? Number(riga.quota_percentuale) / 100 : 0;
}

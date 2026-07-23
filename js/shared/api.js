// Client Supabase condiviso + helper per invocare le edge function autenticate.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function invokeFunction(nome, body) {
  const { data, error } = await supabaseClient.functions.invoke(nome, { body });
  if (error) {
    let dettaglio = error.message;
    try {
      const ctx = await error.context.json();
      dettaglio = JSON.stringify(ctx, null, 2);
    } catch (_) {
      // il body dell'errore non era JSON, teniamo error.message
    }
    throw new Error(dettaglio);
  }
  return data;
}

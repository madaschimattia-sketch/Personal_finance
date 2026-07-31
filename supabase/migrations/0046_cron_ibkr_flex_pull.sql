-- Cron giornaliero per ibkr-flex-pull: prima non era mai schedulato (richiedeva un
-- JWT di sessione utente reale, mai automatizzato) — ora la function riconosce anche
-- la service_role key (vedi doppio binario in ibkr-flex-pull/index.ts) e processa
-- tutti i conti IBKR attivi. Orario 05:00 UTC, prima del sync prezzi conti
-- amministrato (06:00) cosi' i dati IBKR sono freschi quando gira il resto.
select cron.schedule(
  'ibkr-flex-pull',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://qvvpxsvatyyjptjvtpcc.supabase.co/functions/v1/ibkr-flex-pull',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

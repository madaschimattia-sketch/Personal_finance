-- Cron giornaliero per sync-prezzi-conti-amministrati: valorizza Banca Generali/
-- Widiba/BG Saxo da Yahoo Finance, senza alcun import manuale di prezzi (scelta
-- esplicita dell'utente: resta solo il caricamento dei movimenti a mano). La
-- service_role key non è mai hardcoded qui (a differenza del pattern usato in
-- lmadvisorylive): vive cifrata in Supabase Vault (secret "service_role_key",
-- inserito dall'utente dal SQL Editor, non da una migration) e viene letta a
-- runtime dal job. Chi riapplica questa migration su un altro progetto deve
-- prima creare quel secret a mano (select vault.create_secret(...)).
create extension if not exists pg_cron;
create extension if not exists pg_net;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'sync-prezzi-conti-amministrati',
  '0 6 * * *', -- ogni giorno alle 06:00 UTC (dopo la chiusura dei mercati USA/EU del giorno prima)
  $$
  select net.http_post(
    url     := 'https://qvvpxsvatyyjptjvtpcc.supabase.co/functions/v1/sync-prezzi-conti-amministrati',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

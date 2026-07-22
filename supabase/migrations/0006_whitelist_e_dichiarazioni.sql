-- 1) tax_paesi_whitelist: colonna verificato (stesso pattern di config_fiscale_parametri).
--    Seed minimo: FR e US, gli unici paesi emittenti di titoli di stato nei dati attuali
--    (OAT francese, T-bond USA). Non e' l'elenco completo del DM 4 settembre 1996 (che
--    delega l'elenco a decreti separati aggiornati semestralmente, art. 11 c.4 lett. c del
--    D.Lgs 239/1996 — la legge abilitante non contiene la lista): verificato=false finche'
--    non si conferma sul testo consolidato del decreto specifico.
alter table public.tax_paesi_whitelist
  add column if not exists verificato boolean not null default false;

insert into public.tax_paesi_whitelist (paese_codice, descrizione, attivo, verificato) values
  ('FR', 'Francia', true, false),
  ('US', 'Stati Uniti', true, false)
on conflict (paese_codice) do nothing;

-- 2) dichiarazioni_fiscali: stato dichiarazione per anno. Pilota il motore lotti: gli anni
--    'presentata' sono immutabili (il motore non li ricalcola/sovrascrive, solo verifica
--    che il calcolo coincida con quanto gia' registrato).
create table if not exists public.dichiarazioni_fiscali (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  anno               int not null,
  stato              text not null default 'non_iniziata'
                       check (stato in ('non_iniziata','in_preparazione','presentata')),
  data_presentazione date,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint dichiarazioni_fiscali_uniq unique (user_id, anno)
);

comment on table public.dichiarazioni_fiscali is 'Stato dichiarazione per anno fiscale. stato=presentata blocca il ricalcolo dei lotti per quell''anno nel motore fiscale.';

drop trigger if exists dichiarazioni_fiscali_set_updated_at on public.dichiarazioni_fiscali;
create trigger dichiarazioni_fiscali_set_updated_at
  before update on public.dichiarazioni_fiscali
  for each row execute function public.set_updated_at();

alter table public.dichiarazioni_fiscali enable row level security;
create policy dichiarazioni_fiscali_select_own on public.dichiarazioni_fiscali for select using (auth.uid() = user_id);
create policy dichiarazioni_fiscali_insert_own on public.dichiarazioni_fiscali for insert with check (auth.uid() = user_id);
create policy dichiarazioni_fiscali_update_own on public.dichiarazioni_fiscali for update using (auth.uid() = user_id);
create policy dichiarazioni_fiscali_delete_own on public.dichiarazioni_fiscali for delete using (auth.uid() = user_id);

insert into public.dichiarazioni_fiscali (user_id, anno, stato, note) values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 2023, 'presentata', 'Dichiarazione gia'' presentata — anno immutabile per il motore lotti'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 2024, 'presentata', 'Dichiarazione gia'' presentata — anno immutabile per il motore lotti'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 2025, 'in_preparazione', 'Da preparare e validare ora'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 2026, 'non_iniziata', 'Anno in corso, dati parziali')
on conflict (user_id, anno) do nothing;

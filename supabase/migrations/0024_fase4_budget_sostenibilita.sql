-- Fase 4 — BUDGET: motore di sostenibilità costi fissi vs reddito e allocazione
-- ottimale del margine. Scope deciso con l'utente: NON traccia la spesa variabile
-- (niente ingestione estratto conto/carta per ora) — lavora solo su UTENZE
-- (costi fissi) vs INTROITI (reddito), capendo se i costi fissi sono sostenibili
-- nel lungo periodo e come allocare il margine (fondo emergenza poi
-- risparmio/investimento). Mai raccomandazioni di prodotto specifico — resta fuori
-- dal perimetro della consulenza regolata (vedi memoria di progetto).
--
-- 1) utenze_bollette.frequenza — necessaria per calcolare un costo mensile
--    equivalente corretto: alcune righe (es. AFFITTO) hanno periodo_da/periodo_a
--    che copre la durata del CONTRATTO, non il periodo fatturato dall'importo (che
--    è la rata trimestrale) — senza sapere la frequenza, dividere importo per i
--    mesi di periodo_da/periodo_a darebbe un costo mensile assurdo (5.340€/48 mesi
--    invece di 5.340€/3). Backfill delle 30 righe esistenti in base alla categoria
--    (luce bimestrale, confermato dalle bollette A2A stesse — "Periodicità di
--    fatturazione: Bimestrale"; internet mensile; affitto trimestrale per contratto;
--    condominio annuale, un esercizio alla volta).
alter table public.utenze_bollette
  add column if not exists frequenza text
    check (frequenza in ('mensile','bimestrale','trimestrale','semestrale','annuale','una_tantum'));
comment on column public.utenze_bollette.frequenza is 'Periodicità di fatturazione di questa riga — usata dal motore budget per calcolare il costo mensile equivalente (importo / mesi_per_frequenza), indipendente da periodo_da/periodo_a che per alcune categorie (es. affitto) copre la durata del contratto, non il periodo fatturato.';

update public.utenze_bollette set frequenza = 'bimestrale' where categoria = 'luce';
update public.utenze_bollette set frequenza = 'mensile' where categoria = 'internet_telefono';
update public.utenze_bollette set frequenza = 'trimestrale' where categoria = 'affitto';
update public.utenze_bollette set frequenza = 'annuale' where categoria = 'condominio';

-- 2) config_budget_parametri — soglie di sostenibilità e target fondo emergenza,
--    parametrizzate (non hardcoded) e già pensate per la personalizzazione futura
--    per persona: intestatario_id nullable, null = default globale, una riga con
--    intestatario_id valorizzato sovrascrive il default per quella persona (stesso
--    principio di "spese di prima necessità" diverse in proporzione al reddito —
--    non implementato ora, ma la struttura lo permette senza migrazioni future).
--    Stesso pattern di config_fiscale_parametri (chiave/valore), senza colonna anno
--    perché le soglie di sostenibilità non sono specifiche di un anno fiscale.
create table if not exists public.config_budget_parametri (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  intestatario_id    uuid references public.intestatari(id) on delete cascade,
  chiave             text not null,
  valore             numeric not null,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint config_budget_parametri_uniq unique (user_id, intestatario_id, chiave)
);

comment on table public.config_budget_parametri is 'Soglie del motore di sostenibilità budget (Fase 4). intestatario_id null = default globale; valorizzato = override personalizzato per quella persona (non ancora usato, struttura pronta).';

alter table public.config_budget_parametri enable row level security;
create policy config_budget_parametri_select_own on public.config_budget_parametri for select using (auth.uid() = user_id);
create policy config_budget_parametri_insert_own on public.config_budget_parametri for insert with check (auth.uid() = user_id);
create policy config_budget_parametri_update_own on public.config_budget_parametri for update using (auth.uid() = user_id);
create policy config_budget_parametri_delete_own on public.config_budget_parametri for delete using (auth.uid() = user_id);

insert into public.config_budget_parametri (user_id, intestatario_id, chiave, valore, note)
values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 'soglia_sostenibile_pct', 40, 'Costi fissi / reddito ricorrente ≤ questa soglia = sostenibile. Standard di partenza, da personalizzare per persona/fascia di reddito in futuro.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 'soglia_attenzione_pct', 55, 'Costi fissi / reddito ricorrente tra soglia_sostenibile e questa = attenzione; oltre = a rischio.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 'target_mesi_fondo_emergenza_min', 3, 'Mesi di costi fissi da coprire come fondo di emergenza minimo prima di suggerire di spingere oltre su risparmio/investimento.'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 'target_mesi_fondo_emergenza_max', 6, 'Mesi di costi fissi per il fondo di emergenza pieno (limite superiore del range suggerito).');

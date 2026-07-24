-- Fase 4 — BUDGET: spese fisse ricorrenti a inserimento manuale (subscription digitali
-- + altri costi fissi personali non legati a un domicilio: auto, assicurazioni, banca).
-- Struttura generale decisa con l'utente durante la costruzione del motore di
-- sostenibilità: sono tutte, strutturalmente, "un costo periodico con una frequenza",
-- proprio come utenze_bollette — ma senza PDF da ingerire (inserimento manuale diretto,
-- niente documento_grezzo_id) e senza domicilio_id: sono personali dell'intestatario
-- (es. l'abbonamento Netflix o l'RC auto non sono legati a "quale casa abiti", a
-- differenza di luce/gas/affitto che sono per forza legati al domicilio).
--
-- Caso concreto che ha portato a separare questa tabella da utenze_bollette: il piano
-- telefonico cellulare (SIM), a differenza dell'internet fisso di casa, è personale e
-- segue la persona indipendentemente da dove abita — va qui (categoria 'telefono
-- cellulare' via 'altro' o categoria dedicata), non forzato dentro
-- utenze_bollette.categoria='internet_telefono' (quella resta per l'internet fisso,
-- legato al domicilio).
create table if not exists public.spese_fisse_manuali (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  intestatario_id    uuid not null references public.intestatari(id) on delete restrict,

  nome               text not null,          -- es. "Netflix", "RC Auto Panda", "Canone conto BPM"
  categoria          text not null
                       check (categoria in ('streaming','software','fitness','veicolo','assicurazione','bancario','altro')),
  importo            numeric not null,
  frequenza          text not null
                       check (frequenza in ('mensile','bimestrale','trimestrale','semestrale','annuale','una_tantum')),

  data_inizio        date,
  data_fine          date,                   -- nullable: valorizzata se disdetta/scaduta
  attivo             boolean not null default true,

  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.spese_fisse_manuali is 'Spese fisse ricorrenti a inserimento manuale (subscription + auto/assicurazioni/banca), personali dell''intestatario, non legate a un domicilio. Alimenta il motore di sostenibilità di calcola-budget-sostenibilita insieme a utenze_bollette.';

create index if not exists spese_fisse_manuali_intestatario_idx
  on public.spese_fisse_manuali (intestatario_id, attivo);

alter table public.spese_fisse_manuali enable row level security;
create policy spese_fisse_manuali_select_own on public.spese_fisse_manuali for select using (auth.uid() = user_id);
create policy spese_fisse_manuali_insert_own on public.spese_fisse_manuali for insert with check (auth.uid() = user_id);
create policy spese_fisse_manuali_update_own on public.spese_fisse_manuali for update using (auth.uid() = user_id);
create policy spese_fisse_manuali_delete_own on public.spese_fisse_manuali for delete using (auth.uid() = user_id);

-- Fase 3 — INTROITI DA LAVORO: buste paga (ramo dipendente). Stessa pipeline di
-- ingestione di UTENZE (Drive -> PDF -> Claude), documento grezzo -> dato
-- normalizzato. documenti_grezzi.sezione='introiti' era gia' supportato da Fase 0,
-- nessuna modifica li' necessaria.
--
-- Predisposizione per liberi professionisti (partita IVA, memoria di progetto §4.3):
-- il ramo dipendente e il ramo autonomo restano **tabelle separate** (buste paga vs
-- fatture emesse/ritenute/contributi hanno campi troppo diversi per un'unica tabella
-- con discriminatore), non una singola tabella con colonna tipo_reddito — l'identita'
-- stessa della tabella e' il discriminatore. Quando il ramo autonomo verra' costruito
-- (introiti_fatture_autonomo, non ancora fatto: nessun dato reale su cui progettarlo),
-- una vista v_introiti_totali unira' le due tabelle in un'unica vista aggregata, senza
-- toccare questa.

create table if not exists public.introiti_buste_paga (
  id                            uuid primary key default extensions.uuid_generate_v4(),
  user_id                       uuid not null references auth.users(id) on delete cascade,
  intestatario_id               uuid not null references public.intestatari(id) on delete restrict,
  documento_grezzo_id           uuid references public.documenti_grezzi(id) on delete set null,

  datore_lavoro                 text not null,
  periodo_da                    date not null,
  periodo_a                     date not null,
  data_pagamento                date,

  lordo                         numeric not null,
  netto                         numeric not null,
  irpef_trattenuta              numeric,
  contributi_inps               numeric,
  addizionali_regionali_comunali numeric,
  tfr_maturato                  numeric,
  altre_trattenute              numeric,

  note                          text,
  raw_estrazione                jsonb,
  created_at                    timestamptz not null default now()
);

comment on table public.introiti_buste_paga is 'Buste paga normalizzate (ramo dipendente). documento_grezzo_id traccia il PDF sorgente (Storage, immutabile).';
comment on column public.introiti_buste_paga.tfr_maturato is 'TFR maturato nel periodo, solo informativo — nessuna tabella dedicata al cumulo TFR ancora (decisione aperta: integrarlo qui o in INVESTIMENTI, vedi memoria di progetto).';
comment on column public.introiti_buste_paga.raw_estrazione is 'JSON grezzo restituito dall''estrazione Claude — permette ri-derivazione dei campi normalizzati se il parser migliora, senza richiamare l''API.';

create index if not exists introiti_buste_paga_periodo_idx
  on public.introiti_buste_paga (intestatario_id, periodo_da);

alter table public.introiti_buste_paga enable row level security;
create policy introiti_buste_paga_select_own on public.introiti_buste_paga for select using (auth.uid() = user_id);
create policy introiti_buste_paga_insert_own on public.introiti_buste_paga for insert with check (auth.uid() = user_id);
create policy introiti_buste_paga_update_own on public.introiti_buste_paga for update using (auth.uid() = user_id);
create policy introiti_buste_paga_delete_own on public.introiti_buste_paga for delete using (auth.uid() = user_id);

-- Fase 1 — Tabelle operative: conti, conto_intestatari, movimenti
-- + estensione multi-origine di documenti_grezzi (grezzo IBKR, non solo Drive).
--
-- Convenzioni (replicate da Fase 0):
--   * user_id NOT NULL su ogni tabella, FK -> auth.users(id).
--   * RLS attiva + 4 policy per tabella: select/insert/update/delete own (auth.uid() = user_id).
--   * id uuid default uuid_generate_v4(); timestamps timestamptz default now().
-- Importi normalizzati in valuta base (EUR) alla scrittura; valuta/fx conservano la provenienza nativa.

-- ---------------------------------------------------------------------------
-- 1) documenti_grezzi: da "solo Drive" a multi-origine (Drive | IBKR Flex | manuale)
-- ---------------------------------------------------------------------------
alter table public.documenti_grezzi
  alter column drive_file_id drop not null;

alter table public.documenti_grezzi
  add column if not exists origine text not null default 'drive'
    check (origine in ('drive','ibkr_flex','manuale')),
  add column if not exists origine_ref text,          -- es. ReferenceCode Flex, o id manuale
  add column if not exists conto_id uuid,             -- FK aggiunta dopo la creazione di conti
  add column if not exists periodo_da date,
  add column if not exists periodo_a date;

comment on column public.documenti_grezzi.origine is 'Provenienza del grezzo: drive | ibkr_flex | manuale';
comment on column public.documenti_grezzi.origine_ref is 'Riferimento di provenienza non-Drive (es. ReferenceCode Flex + periodo)';

-- ---------------------------------------------------------------------------
-- 2) conti — anagrafica conti (broker/banca). Una Flex Query per conto IBKR.
-- ---------------------------------------------------------------------------
create table if not exists public.conti (
  id                uuid primary key default extensions.uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  nome              text not null,                       -- alias leggibile
  broker            text not null default 'IBKR',
  ibkr_account_id   text,                                -- es. U13283246 (null per non-IBKR)
  flex_query_id     text,                                -- QueryId Flex per QUESTO conto (null se non IBKR)
  valuta_base       text not null default 'EUR',
  regime_fiscale    text not null default 'dichiarativo'
                      check (regime_fiscale in ('dichiarativo','amministrato','non_applicabile')),
  attivo            boolean not null default true,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- un conto IBKR è identificato univocamente per utente dall'accountId
  constraint conti_user_ibkr_account_uniq unique (user_id, broker, ibkr_account_id)
);

comment on table public.conti is 'Conti broker/banca. regime_fiscale pilota i quadri RT/RM/RW.';
comment on column public.conti.flex_query_id is 'IBKR Flex QueryId dedicato a questo conto (modello: una query per conto). Il token e'' un secret unico.';

-- FK differita da documenti_grezzi -> conti
alter table public.documenti_grezzi
  add constraint documenti_grezzi_conto_id_fkey
  foreign key (conto_id) references public.conti(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3) conto_intestatari — ponte quota-based conto <-> intestatario
--    (stesso pattern previsto per le cointestazioni; user_id != intestatario).
-- ---------------------------------------------------------------------------
create table if not exists public.conto_intestatari (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  conto_id           uuid not null references public.conti(id) on delete cascade,
  intestatario_id    uuid not null references public.intestatari(id) on delete restrict,
  quota_percentuale  numeric(6,3) not null default 100
                       check (quota_percentuale > 0 and quota_percentuale <= 100),
  created_at         timestamptz not null default now(),
  constraint conto_intestatari_uniq unique (conto_id, intestatario_id)
);

comment on table public.conto_intestatari is 'Cointestazione conto con quota %. user_id = proprietario del record (auth); intestatario_id = titolarita'' del dato.';

-- ---------------------------------------------------------------------------
-- 4) movimenti — ledger normalizzato per conto (fed da IBKR Flex).
--    Tutta l'attività del conto: trade, cassa, redditi, commissioni, transfer.
--    Idempotenza sull'id transazione IBKR. importo in valuta base (EUR).
-- ---------------------------------------------------------------------------
create table if not exists public.movimenti (
  id                   uuid primary key default extensions.uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  conto_id             uuid not null references public.conti(id) on delete cascade,
  documento_grezzo_id  uuid references public.documenti_grezzi(id) on delete set null,

  tipo                 text not null
                         check (tipo in ('trade','dividendo','interessi','ritenuta',
                                         'versamento','prelievo','commissione',
                                         'transfer_titoli','transfer_cassa','altro')),
  data                 date not null,                  -- data evento (tradeDate/dateTime)
  data_regolamento     date,                           -- settleDate/settleDateTarget

  -- identita' strumento (null per pura cassa)
  asset_category       text,                           -- STK | BOND | CASH | OPT | ...
  symbol               text,
  isin                 text,
  conid                text,

  -- valori: importo/prezzo/commissioni in VALUTA BASE (EUR)
  quantita             numeric,
  prezzo               numeric,
  commissioni          numeric not null default 0,
  importo              numeric not null,               -- netCash/amount in EUR (segno: entrate +, uscite -)
  valuta               text not null default 'EUR',    -- valuta nativa della riga
  fx_rate              numeric not null default 1,      -- fxRateToBase al momento
  importo_valuta       numeric,                        -- importo in valuta nativa (audit)

  -- chiavi naturali IBKR (idempotenza)
  ibkr_transaction_id  text,
  ibkr_trade_id        text,

  descrizione          text,
  raw                  jsonb,                           -- attributi XML originali della riga (audit/re-derivazione)
  created_at           timestamptz not null default now()
);

comment on table public.movimenti is 'Ledger normalizzato per conto (IBKR Flex). importo/prezzo/commissioni in EUR (valuta base). raw = riga XML originale.';

-- dedup: una riga per transazione IBKR e per conto
create unique index if not exists movimenti_conto_txid_uniq
  on public.movimenti (conto_id, ibkr_transaction_id)
  where ibkr_transaction_id is not null;

create index if not exists movimenti_conto_data_idx on public.movimenti (conto_id, data);
create index if not exists movimenti_user_idx on public.movimenti (user_id);

-- ---------------------------------------------------------------------------
-- 5) trigger updated_at per conti (allineato al pattern di intestatari)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conti_set_updated_at on public.conti;
create trigger conti_set_updated_at
  before update on public.conti
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6) RLS — attiva + 4 policy own per ogni tabella nuova (pattern Fase 0)
-- ---------------------------------------------------------------------------
alter table public.conti              enable row level security;
alter table public.conto_intestatari enable row level security;
alter table public.movimenti         enable row level security;

-- conti
create policy conti_select_own on public.conti for select using (auth.uid() = user_id);
create policy conti_insert_own on public.conti for insert with check (auth.uid() = user_id);
create policy conti_update_own on public.conti for update using (auth.uid() = user_id);
create policy conti_delete_own on public.conti for delete using (auth.uid() = user_id);

-- conto_intestatari
create policy conto_intestatari_select_own on public.conto_intestatari for select using (auth.uid() = user_id);
create policy conto_intestatari_insert_own on public.conto_intestatari for insert with check (auth.uid() = user_id);
create policy conto_intestatari_update_own on public.conto_intestatari for update using (auth.uid() = user_id);
create policy conto_intestatari_delete_own on public.conto_intestatari for delete using (auth.uid() = user_id);

-- movimenti
create policy movimenti_select_own on public.movimenti for select using (auth.uid() = user_id);
create policy movimenti_insert_own on public.movimenti for insert with check (auth.uid() = user_id);
create policy movimenti_update_own on public.movimenti for update using (auth.uid() = user_id);
create policy movimenti_delete_own on public.movimenti for delete using (auth.uid() = user_id);

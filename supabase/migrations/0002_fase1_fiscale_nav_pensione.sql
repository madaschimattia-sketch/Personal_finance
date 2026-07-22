-- Fase 1 — Motore fiscale (7 tabelle approvate + supporto), NAV giornaliero, fondi pensione.
--
-- Convenzioni: user_id + RLS own-row per i dati personali; le tabelle di riferimento
-- normativo (tax_paesi_whitelist, config_fiscale_parametri, tax_instruments, fx_rates_ecb)
-- sono GLOBALI (nessun user_id): dato oggettivo/di legge, non di proprietà dell'utente.
-- Pattern RLS per le globali: SELECT per autenticati, scrittura solo service_role (nessuna
-- policy insert/update/delete) — stesso pattern di mercati_snapshot in LMadvisory.

-- ---------------------------------------------------------------------------
-- 1) conto_nav_giornaliero — da EquitySummaryByReportDateInBase (IBKR Flex).
--    Fonte per performance E per giacenza media (IVAFE cash, regime fisso).
-- ---------------------------------------------------------------------------
create table if not exists public.conto_nav_giornaliero (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  conto_id      uuid not null references public.conti(id) on delete cascade,
  report_date   date not null,
  cash_eur      numeric not null default 0,
  stock_eur     numeric not null default 0,
  bonds_eur     numeric not null default 0,
  options_eur   numeric not null default 0,
  funds_eur     numeric not null default 0,
  commodities_eur numeric not null default 0,
  crypto_eur    numeric not null default 0,
  total_eur     numeric not null default 0,
  created_at    timestamptz not null default now(),
  constraint conto_nav_giornaliero_uniq unique (conto_id, report_date)
);

comment on table public.conto_nav_giornaliero is 'NAV giornaliero per asset class (EquitySummaryInBase). Fonte per performance e per giacenza media cash (IVAFE).';

create index if not exists conto_nav_giornaliero_conto_data_idx on public.conto_nav_giornaliero (conto_id, report_date);

alter table public.conto_nav_giornaliero enable row level security;
create policy conto_nav_select_own on public.conto_nav_giornaliero for select using (auth.uid() = user_id);
create policy conto_nav_insert_own on public.conto_nav_giornaliero for insert with check (auth.uid() = user_id);
create policy conto_nav_update_own on public.conto_nav_giornaliero for update using (auth.uid() = user_id);
create policy conto_nav_delete_own on public.conto_nav_giornaliero for delete using (auth.uid() = user_id);

-- Vista di comodo: giacenza media annua di cassa per conto/anno (per IVAFE regime fisso).
-- Nota: media sui soli report_date presenti (giorni di mercato IBKR), non sui 365 giorni
-- solari — approssimazione accettabile per la soglia; raffinare nel motore se serve la
-- media esatta calendario (richiede riempimento dei giorni non di mercato col saldo precedente).
create or replace view public.v_giacenza_media_cash_annua as
select
  conto_id,
  user_id,
  extract(year from report_date)::int as anno,
  avg(cash_eur) as giacenza_media_cash_eur,
  count(*) as giorni_osservati
from public.conto_nav_giornaliero
group by conto_id, user_id, extract(year from report_date);

-- ---------------------------------------------------------------------------
-- 2) config_fiscale_parametri — parametri di legge per anno (NON hardcoded nel codice).
--    Valori seed = riferimenti storicamente noti, DA VERIFICARE per l'anno fiscale
--    corrente prima di ogni calcolo reale (non sono un'assunzione di validità attuale).
-- ---------------------------------------------------------------------------
create table if not exists public.config_fiscale_parametri (
  anno          int not null,
  chiave        text not null,
  valore        numeric not null,
  descrizione   text,
  verificato    boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (anno, chiave)
);

comment on table public.config_fiscale_parametri is 'Parametri fiscali per anno (aliquote, soglie, importi fissi). verificato=false finche'' non confermati per l''anno corrente.';

insert into public.config_fiscale_parametri (anno, chiave, valore, descrizione, verificato) values
  (2026, 'aliquota_capital_gain_ordinaria_pct', 26.0, 'Aliquota su plusvalenze/redditi di capitale ordinari', false),
  (2026, 'aliquota_whitelist_titoli_stato_pct', 12.5, 'Aliquota agevolata titoli di stato whitelist', false),
  (2026, 'ivafe_proporzionale_pct', 0.2, 'IVAFE proporzionale su prodotti finanziari esteri', false),
  (2026, 'ivafe_cash_fissa_eur', 34.20, 'IVAFE fissa su liquidita'' estera (regime fisso, analogo bollo c/c)', false),
  (2026, 'ivafe_cash_soglia_giacenza_media_eur', 5000, 'Soglia giacenza media annua sotto cui l''IVAFE fissa cash non e'' dovuta', false),
  (2026, 'minusvalenze_anni_carryforward', 4, 'Anni di riportabilita'' delle minusvalenze pregresse', false)
on conflict (anno, chiave) do nothing;

alter table public.config_fiscale_parametri enable row level security;
create policy config_fiscale_parametri_select_auth on public.config_fiscale_parametri
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 3) tax_paesi_whitelist — elenco paesi emittenti titoli di stato whitelist 12,5%
--    (chiave: issuerCountryCode di SecurityInfo, non issuer). Globale, non per utente.
-- ---------------------------------------------------------------------------
create table if not exists public.tax_paesi_whitelist (
  paese_codice  text primary key,          -- ISO 3166-1 alpha-2 (issuerCountryCode IBKR)
  descrizione   text not null,
  attivo        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.tax_paesi_whitelist is 'Paesi i cui titoli di stato godono dell''aliquota agevolata 12,5%. Da rivedere/confermare periodicamente.';

alter table public.tax_paesi_whitelist enable row level security;
create policy tax_paesi_whitelist_select_auth on public.tax_paesi_whitelist
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 4) fx_rates_ecb — cambi BCE giornalieri. Globale, non per utente.
-- ---------------------------------------------------------------------------
create table if not exists public.fx_rates_ecb (
  data      date not null,
  valuta    text not null,     -- ISO 4217 (es. USD, GBP)
  tasso     numeric not null,  -- unita' di valuta per 1 EUR (convenzione BCE)
  created_at timestamptz not null default now(),
  primary key (data, valuta)
);

comment on table public.fx_rates_ecb is 'Cambi ufficiali BCE. Riferimento per audit/eventuali ricalcoli; il cambio di trade resta quello nativo IBKR (fxRateToBase), non questo.';

alter table public.fx_rates_ecb enable row level security;
create policy fx_rates_ecb_select_auth on public.fx_rates_ecb
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 5) tax_instruments — anagrafica fiscale strumenti (da SecurityInfo + classificazione).
--    Globale (stesso ISIN = stessa classificazione per chiunque), non per utente.
--    classificazione_confermata=false finche'' non revisionata a mano: gli automatismi
--    (subCategory/issuerCountryCode) sono un SUGGERIMENTO, non una certificazione fiscale.
-- ---------------------------------------------------------------------------
create table if not exists public.tax_instruments (
  id                          uuid primary key default extensions.uuid_generate_v4(),
  isin                        text,
  conid                       text,
  symbol                      text,
  descrizione                 text,
  asset_category              text,             -- STK | BOND | CASH | OPT ...
  issuer                      text,
  issuer_country_code         text,
  metodo_costo                text not null default 'lifo'
                                check (metodo_costo in ('lifo','media_ponderata')),
  is_titolo_stato_whitelist   boolean,          -- null = da verificare manualmente
  is_oicr                     boolean,          -- null = da verificare manualmente (proventi non compensabili)
  classificazione_confermata  boolean not null default false,
  note                        text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint tax_instruments_isin_uniq unique (isin)
);

comment on table public.tax_instruments is 'Anagrafica fiscale per ISIN: metodo di costo, whitelist 12,5%, OICR. classificazione_confermata=false = automatica, da rivedere.';

drop trigger if exists tax_instruments_set_updated_at on public.tax_instruments;
create trigger tax_instruments_set_updated_at
  before update on public.tax_instruments
  for each row execute function public.set_updated_at();

alter table public.tax_instruments enable row level security;
create policy tax_instruments_select_auth on public.tax_instruments
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 6) tax_movements — subset fiscalmente rilevante di movimenti (tabella materializzata,
--    non vista: il motore ci costruisce sopra lotti/chiusure e serve stabilita'/audit).
-- ---------------------------------------------------------------------------
create table if not exists public.tax_movements (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  conto_id            uuid not null references public.conti(id) on delete cascade,
  movimento_id        uuid references public.movimenti(id) on delete set null,
  instrument_id       uuid references public.tax_instruments(id) on delete set null,

  tipo                text not null
                        check (tipo in ('acquisto','vendita','dividendo','cedola',
                                        'interessi','ritenuta','rimborso_capitale')),
  data                date not null,
  quantita            numeric,
  prezzo_eur           numeric,
  importo_eur          numeric not null,
  commissioni_eur      numeric not null default 0,

  ibkr_transaction_id  text,
  ibkr_trade_id        text,

  created_at           timestamptz not null default now()
);

comment on table public.tax_movements is 'Subset fiscale di movimenti: input del motore lotti/chiusure. Popolata dallo stesso pull IBKR.';

create unique index if not exists tax_movements_conto_txid_uniq
  on public.tax_movements (conto_id, ibkr_transaction_id)
  where ibkr_transaction_id is not null;

create index if not exists tax_movements_user_idx on public.tax_movements (user_id);
create index if not exists tax_movements_instrument_idx on public.tax_movements (instrument_id);

alter table public.tax_movements enable row level security;
create policy tax_movements_select_own on public.tax_movements for select using (auth.uid() = user_id);
create policy tax_movements_insert_own on public.tax_movements for insert with check (auth.uid() = user_id);
create policy tax_movements_update_own on public.tax_movements for update using (auth.uid() = user_id);
create policy tax_movements_delete_own on public.tax_movements for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7) tax_lots — lotti aperti (LIFO az/obbl/opz, media ponderata ETF/OICR).
-- ---------------------------------------------------------------------------
create table if not exists public.tax_lots (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  conto_id              uuid not null references public.conti(id) on delete cascade,
  instrument_id         uuid not null references public.tax_instruments(id) on delete restrict,
  acquisto_movement_id  uuid references public.tax_movements(id) on delete set null,

  metodo_applicato      text not null check (metodo_applicato in ('lifo','media_ponderata')),
  data_acquisto         date not null,
  quantita_originale    numeric not null,
  quantita_residua      numeric not null,
  costo_unitario_eur    numeric not null,
  costo_totale_eur      numeric not null,
  stato                 text not null default 'aperto' check (stato in ('aperto','chiuso')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.tax_lots is 'Lotti di carico per strumento/conto. metodo_applicato bloccato alla creazione del lotto.';

create index if not exists tax_lots_instrument_idx on public.tax_lots (instrument_id, conto_id, stato);

drop trigger if exists tax_lots_set_updated_at on public.tax_lots;
create trigger tax_lots_set_updated_at
  before update on public.tax_lots
  for each row execute function public.set_updated_at();

alter table public.tax_lots enable row level security;
create policy tax_lots_select_own on public.tax_lots for select using (auth.uid() = user_id);
create policy tax_lots_insert_own on public.tax_lots for insert with check (auth.uid() = user_id);
create policy tax_lots_update_own on public.tax_lots for update using (auth.uid() = user_id);
create policy tax_lots_delete_own on public.tax_lots for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 8) tax_lot_closures — abbinamento vendita -> lotto/i (output motore LIFO/media).
-- ---------------------------------------------------------------------------
create table if not exists public.tax_lot_closures (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  lot_id                uuid not null references public.tax_lots(id) on delete cascade,
  vendita_movement_id   uuid not null references public.tax_movements(id) on delete cascade,

  data_chiusura         date not null,
  quantita_chiusa       numeric not null,
  costo_eur             numeric not null,
  ricavo_eur            numeric not null,
  plus_minus_eur        numeric not null,
  giorni_detenzione      int,
  categoria_compensazione text
                          check (categoria_compensazione in ('ordinaria','whitelist','oicr_non_compensabile')),

  created_at            timestamptz not null default now()
);

comment on table public.tax_lot_closures is 'Chiusura lotto per vendita: plus/minus e categoria di compensabilita'' (OICR non compensa minus pregresse).';

create index if not exists tax_lot_closures_lot_idx on public.tax_lot_closures (lot_id);
create index if not exists tax_lot_closures_vendita_idx on public.tax_lot_closures (vendita_movement_id);

alter table public.tax_lot_closures enable row level security;
create policy tax_lot_closures_select_own on public.tax_lot_closures for select using (auth.uid() = user_id);
create policy tax_lot_closures_insert_own on public.tax_lot_closures for insert with check (auth.uid() = user_id);
create policy tax_lot_closures_update_own on public.tax_lot_closures for update using (auth.uid() = user_id);
create policy tax_lot_closures_delete_own on public.tax_lot_closures for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9) tax_events — aggregati dichiarativi per quadro (RT/RM/RW).
-- ---------------------------------------------------------------------------
create table if not exists public.tax_events (
  id              uuid primary key default extensions.uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conto_id        uuid references public.conti(id) on delete set null,

  anno            int not null,
  quadro          text not null check (quadro in ('RT','RM','RW')),
  tipo            text not null,               -- es. plusvalenza_ordinaria, dividendo, ivafe_cash_fissa, ivafe_proporzionale
  riferimento_id  uuid,                        -- lot_closure_id / tax_movement_id / null (es. IVAFE cash)
  imponibile_eur  numeric not null default 0,
  aliquota_pct    numeric,
  imposta_eur     numeric not null default 0,
  note            text,

  created_at      timestamptz not null default now()
);

comment on table public.tax_events is 'Aggregato per dichiarazione (RT/RM/RW), anno per anno. riferimento_id punta a lot_closure o movement a seconda del tipo.';

create index if not exists tax_events_user_anno_idx on public.tax_events (user_id, anno, quadro);

alter table public.tax_events enable row level security;
create policy tax_events_select_own on public.tax_events for select using (auth.uid() = user_id);
create policy tax_events_insert_own on public.tax_events for insert with check (auth.uid() = user_id);
create policy tax_events_update_own on public.tax_events for update using (auth.uid() = user_id);
create policy tax_events_delete_own on public.tax_events for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 10) tax_loss_carryforward — minusvalenze pregresse riportabili (4 anni).
-- ---------------------------------------------------------------------------
create table if not exists public.tax_loss_carryforward (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  anno_origine          int not null,
  anno_scadenza         int not null,          -- anno_origine + 4
  categoria             text not null check (categoria in ('ordinaria','whitelist')),
  importo_originario_eur numeric not null,
  importo_residuo_eur    numeric not null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.tax_loss_carryforward is 'Minusvalenze pregresse riportabili. categoria distingue il fondo di compensazione (i proventi OICR non compensano qui).';

create index if not exists tax_loss_carryforward_user_idx on public.tax_loss_carryforward (user_id, anno_scadenza);

drop trigger if exists tax_loss_carryforward_set_updated_at on public.tax_loss_carryforward;
create trigger tax_loss_carryforward_set_updated_at
  before update on public.tax_loss_carryforward
  for each row execute function public.set_updated_at();

alter table public.tax_loss_carryforward enable row level security;
create policy tax_loss_carryforward_select_own on public.tax_loss_carryforward for select using (auth.uid() = user_id);
create policy tax_loss_carryforward_insert_own on public.tax_loss_carryforward for insert with check (auth.uid() = user_id);
create policy tax_loss_carryforward_update_own on public.tax_loss_carryforward for update using (auth.uid() = user_id);
create policy tax_loss_carryforward_delete_own on public.tax_loss_carryforward for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 11) Fondi pensione — dominio separato dal motore IBKR. Italiani ed esteri,
--     upload manuale (nessuna pipeline automatica). is_estero -> monitoraggio RW.
-- ---------------------------------------------------------------------------
create table if not exists public.fondi_pensione (
  id                uuid primary key default extensions.uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  intestatario_id   uuid not null references public.intestatari(id) on delete restrict,

  nome              text not null,
  tipo              text not null check (tipo in ('fondo_aperto','pip','fondo_chiuso_negoziale','estero')),
  is_estero         boolean not null default false,
  provider          text,
  note              text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.fondi_pensione is 'Anagrafica fondi pensione (italiani ed esteri). is_estero pilota il monitoraggio RW.';

drop trigger if exists fondi_pensione_set_updated_at on public.fondi_pensione;
create trigger fondi_pensione_set_updated_at
  before update on public.fondi_pensione
  for each row execute function public.set_updated_at();

alter table public.fondi_pensione enable row level security;
create policy fondi_pensione_select_own on public.fondi_pensione for select using (auth.uid() = user_id);
create policy fondi_pensione_insert_own on public.fondi_pensione for insert with check (auth.uid() = user_id);
create policy fondi_pensione_update_own on public.fondi_pensione for update using (auth.uid() = user_id);
create policy fondi_pensione_delete_own on public.fondi_pensione for delete using (auth.uid() = user_id);

create table if not exists public.fondo_pensione_versamenti (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  fondo_id              uuid not null references public.fondi_pensione(id) on delete cascade,
  documento_grezzo_id   uuid references public.documenti_grezzi(id) on delete set null,

  data                  date not null,
  anno_competenza       int not null,          -- anno fiscale di competenza della deduzione
  importo_eur           numeric not null,
  tipo_versamento       text not null
                          check (tipo_versamento in ('volontario','contributo_datore_lavoro','tfr','trasferimento_da_altro_fondo')),
  deducibile            boolean not null default true,
  note                  text,

  created_at            timestamptz not null default now()
);

comment on table public.fondo_pensione_versamenti is 'Versamenti manuali (documento di supporto in documenti_grezzi). anno_competenza per il tetto deduzione 5.164,57 EUR/anno.';

create index if not exists fondo_pensione_versamenti_fondo_idx on public.fondo_pensione_versamenti (fondo_id, anno_competenza);

alter table public.fondo_pensione_versamenti enable row level security;
create policy fondo_pensione_versamenti_select_own on public.fondo_pensione_versamenti for select using (auth.uid() = user_id);
create policy fondo_pensione_versamenti_insert_own on public.fondo_pensione_versamenti for insert with check (auth.uid() = user_id);
create policy fondo_pensione_versamenti_update_own on public.fondo_pensione_versamenti for update using (auth.uid() = user_id);
create policy fondo_pensione_versamenti_delete_own on public.fondo_pensione_versamenti for delete using (auth.uid() = user_id);

create table if not exists public.fondo_pensione_posizione (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  fondo_id              uuid not null references public.fondi_pensione(id) on delete cascade,
  documento_grezzo_id   uuid references public.documenti_grezzi(id) on delete set null,

  data_valorizzazione   date not null,
  controvalore_eur      numeric not null,
  rendimento_periodo_pct numeric,
  note                  text,

  created_at            timestamptz not null default now(),
  constraint fondo_pensione_posizione_uniq unique (fondo_id, data_valorizzazione)
);

comment on table public.fondo_pensione_posizione is 'Snapshot periodico manuale del controvalore (estratto conto previdenziale caricato a mano).';

alter table public.fondo_pensione_posizione enable row level security;
create policy fondo_pensione_posizione_select_own on public.fondo_pensione_posizione for select using (auth.uid() = user_id);
create policy fondo_pensione_posizione_insert_own on public.fondo_pensione_posizione for insert with check (auth.uid() = user_id);
create policy fondo_pensione_posizione_update_own on public.fondo_pensione_posizione for update using (auth.uid() = user_id);
create policy fondo_pensione_posizione_delete_own on public.fondo_pensione_posizione for delete using (auth.uid() = user_id);

-- documenti_grezzi: 'fiscale' e' gia' un valore ammesso dal CHECK esistente su sezione;
-- riusiamo anche per fondo pensione (sezione 'fiscale' o 'introiti' a seconda del contesto,
-- nessuna modifica di schema necessaria qui).

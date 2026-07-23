-- Riconciliazione lotti calcolati vs snapshot OpenPosition IBKR.
--
-- 1) Fix di un bug scoperto preparando la riconciliazione: IBKR riusa lo stesso
--    transactionID sia per il Trade (vendita di un'obbligazione) sia per il
--    CashTransaction "Bond Interest Received" collegato (rateo accrued interest
--    liquidato alla vendita, tra due cedole) — la chiave (conto_id,
--    ibkr_transaction_id) non basta: durante il backfill, l'upsert del
--    CashTransaction (processato dopo nel loop di ibkr-flex-pull) ha sovrascritto
--    silenziosamente la riga della vendita. Scoperto perche' il T-bond USA non
--    compariva piu' tra le posizioni aperte a fine 2025 in OpenPosition, ma nei
--    nostri dati risultava ancora aperto (nessuna vendita registrata).
drop index if exists public.movimenti_conto_txid_uniq;
create unique index movimenti_conto_txid_uniq
  on public.movimenti (conto_id, ibkr_transaction_id, tipo);

drop index if exists public.tax_movements_conto_txid_uniq;
create unique index tax_movements_conto_txid_uniq
  on public.tax_movements (conto_id, ibkr_transaction_id, tipo);

-- Backfill della vendita mancante (dati dal file grezzo originale BUDGETING_2025.xml,
-- Trade tradeID=1163579689 transactionID=4696509342, tradeDate=2025-09-30):
-- quantity=-4000, tradePrice=98.62075875 USD, fxRateToBase=0.85225, netCash=3939.83 USD,
-- ibCommission=-5 USD. La riga CashTransaction collegata (stesso transactionID,
-- "Bond Interest Received" 1.71 USD) resta quella gia' presente, corretta di suo.
with nuovo_movimento as (
  insert into public.movimenti (
    conto_id, user_id, tipo, data, data_regolamento, asset_category, symbol, isin, conid,
    quantita, prezzo, commissioni, importo, valuta, fx_rate, importo_valuta,
    ibkr_transaction_id, ibkr_trade_id, descrizione, documento_grezzo_id
  ) values (
    '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, 'trade',
    '2025-09-30'::date, '2025-10-01'::date, 'BOND', 'T 0 1/2 02/28/26', 'US91282CBQ33', '474219646',
    -4000, 98.62075875 * 0.85225, abs(-5) * 0.85225, 3939.83 * 0.85225, 'USD', 0.85225, 3939.83,
    '4696509342', '1163579689',
    'T 0 1/2 02/28/26 — vendita recuperata da riconciliazione OpenPosition (mancante nel backfill originale per collisione transactionID con CashTransaction collegato)',
    null
  )
  returning id
)
insert into public.tax_movements (
  conto_id, user_id, movimento_id, instrument_id, tipo, data, quantita, prezzo_eur, importo_eur, commissioni_eur,
  ibkr_transaction_id, ibkr_trade_id
)
select
  '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, nuovo_movimento.id,
  'ac2c540d-04fd-4988-a317-449a99452008'::uuid, 'vendita', '2025-09-30'::date, -4000,
  98.62075875 * 0.85225, 3939.83 * 0.85225, abs(-5) * 0.85225,
  '4696509342', '1163579689'
from nuovo_movimento;

-- 2) Nuova tabella per gli snapshot OpenPosition (fine periodo Flex). Usata SOLO per
--    riconciliare con tax_lots (motore lotti) — non e' input del calcolo fiscale.
create table if not exists public.posizioni_aperte_ibkr (
  id                      uuid primary key default extensions.uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  conto_id                uuid not null references public.conti(id) on delete cascade,

  conid                   text not null,
  isin                    text,
  symbol                  text,
  asset_category          text,
  sub_category            text,

  report_date             date not null,
  position                numeric not null,
  mark_price              numeric,
  position_value_eur      numeric,
  cost_basis_price        numeric,
  cost_basis_money_eur    numeric,
  fifo_pnl_unrealized_eur numeric,
  side                    text,
  valuta                  text,
  fx_rate                 numeric,

  created_at              timestamptz not null default now(),
  constraint posizioni_aperte_ibkr_uniq unique (conto_id, conid, report_date)
);

comment on table public.posizioni_aperte_ibkr is 'Snapshot posizioni aperte da IBKR OpenPosition (fine periodo Flex). Solo per riconciliazione con tax_lots, non input del calcolo fiscale.';

create index if not exists posizioni_aperte_ibkr_conto_idx on public.posizioni_aperte_ibkr (conto_id, report_date);

alter table public.posizioni_aperte_ibkr enable row level security;
create policy posizioni_aperte_select_own on public.posizioni_aperte_ibkr for select using (auth.uid() = user_id);
create policy posizioni_aperte_insert_own on public.posizioni_aperte_ibkr for insert with check (auth.uid() = user_id);
create policy posizioni_aperte_update_own on public.posizioni_aperte_ibkr for update using (auth.uid() = user_id);
create policy posizioni_aperte_delete_own on public.posizioni_aperte_ibkr for delete using (auth.uid() = user_id);

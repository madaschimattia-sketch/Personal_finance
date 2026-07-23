-- Backfill di ALTRE 4 vendite mancanti scoperte dalla riconciliazione OpenPosition,
-- stesso bug della migration 0011 (transactionID condiviso tra Trade e CashTransaction
-- "Bond Interest Received" collegata): l'OAT francese risultava 45.000 unità aperte nei
-- nostri dati contro le 16.000 realmente aperte secondo OpenPosition IBKR a fine 2025.
--
-- Una delle 4 vendite (tradeID 859076263, 2024-11-07, -9000) cade nell'anno 2024, già
-- dichiarato (dichiarazioni_fiscali.stato='presentata'). Questo backfill corregge SOLO
-- il ledger sottostante (movimenti/tax_movements/tax_lots/tax_lot_closures) — non scrive
-- né modifica alcun tax_events per il 2024 (RT/RM/RW non vengono mai calcolati per un
-- anno già presentato da questo sistema). La dichiarazione 2024 effettivamente
-- presentata dall'utente è stata preparata sui propri estratti conto IBKR (non con
-- questo strumento, che non esisteva ancora), quindi presumibilmente già corretta —
-- qui si allinea solo la nostra base dati storica, non si altera nulla di già
-- dichiarato.
with v1 as (
  insert into public.movimenti (
    conto_id, user_id, tipo, data, data_regolamento, asset_category, symbol, isin, conid,
    quantita, prezzo, commissioni, importo, valuta, fx_rate, importo_valuta,
    ibkr_transaction_id, ibkr_trade_id, descrizione, documento_grezzo_id
  ) values (
    '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, 'trade',
    '2024-11-07'::date, '2024-11-11'::date, 'BOND', 'OAT0.5%25MAY72', 'FR0014001NN8', '466846182',
    -9000, 35.13, 9, 3152.7, 'EUR', 1, 3152.7,
    '3274496953', '859076263',
    'FRTR 0 1/2 05/25/2072 — vendita recuperata da riconciliazione OpenPosition (mancante nel backfill originale per collisione transactionID con CashTransaction collegato)',
    null
  ) returning id
), tm1 as (
  insert into public.tax_movements (conto_id, user_id, movimento_id, instrument_id, tipo, data, quantita, prezzo_eur, importo_eur, commissioni_eur, ibkr_transaction_id, ibkr_trade_id)
  select '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, v1.id,
    '675a6e58-457e-4396-8b3c-0556862cff89'::uuid, 'vendita', '2024-11-07'::date, -9000, 35.13, 3152.7, 9, '3274496953', '859076263'
  from v1
),
v2 as (
  insert into public.movimenti (
    conto_id, user_id, tipo, data, data_regolamento, asset_category, symbol, isin, conid,
    quantita, prezzo, commissioni, importo, valuta, fx_rate, importo_valuta,
    ibkr_transaction_id, ibkr_trade_id, descrizione, documento_grezzo_id
  ) values (
    '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, 'trade',
    '2025-05-19'::date, '2025-05-21'::date, 'BOND', 'OAT0.5%25MAY72', 'FR0014001NN8', '466846182',
    -6000, 29.18, 6, 1744.8, 'EUR', 1, 1744.8,
    '4083257336', '1034408286',
    'FRTR 0 1/2 05/25/2072 — vendita recuperata da riconciliazione OpenPosition (mancante nel backfill originale per collisione transactionID con CashTransaction collegato)',
    null
  ) returning id
), tm2 as (
  insert into public.tax_movements (conto_id, user_id, movimento_id, instrument_id, tipo, data, quantita, prezzo_eur, importo_eur, commissioni_eur, ibkr_transaction_id, ibkr_trade_id)
  select '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, v2.id,
    '675a6e58-457e-4396-8b3c-0556862cff89'::uuid, 'vendita', '2025-05-19'::date, -6000, 29.18, 1744.8, 6, '4083257336', '1034408286'
  from v2
),
v3 as (
  insert into public.movimenti (
    conto_id, user_id, tipo, data, data_regolamento, asset_category, symbol, isin, conid,
    quantita, prezzo, commissioni, importo, valuta, fx_rate, importo_valuta,
    ibkr_transaction_id, ibkr_trade_id, descrizione, documento_grezzo_id
  ) values (
    '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, 'trade',
    '2025-05-19'::date, '2025-05-21'::date, 'BOND', 'OAT0.5%25MAY72', 'FR0014001NN8', '466846182',
    -10000, 29.18, 5.5, 2912.5, 'EUR', 1, 2912.5,
    '4083257339', '1034408289',
    'FRTR 0 1/2 05/25/2072 — vendita recuperata da riconciliazione OpenPosition (mancante nel backfill originale per collisione transactionID con CashTransaction collegato)',
    null
  ) returning id
), tm3 as (
  insert into public.tax_movements (conto_id, user_id, movimento_id, instrument_id, tipo, data, quantita, prezzo_eur, importo_eur, commissioni_eur, ibkr_transaction_id, ibkr_trade_id)
  select '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, v3.id,
    '675a6e58-457e-4396-8b3c-0556862cff89'::uuid, 'vendita', '2025-05-19'::date, -10000, 29.18, 2912.5, 5.5, '4083257339', '1034408289'
  from v3
),
v4 as (
  insert into public.movimenti (
    conto_id, user_id, tipo, data, data_regolamento, asset_category, symbol, isin, conid,
    quantita, prezzo, commissioni, importo, valuta, fx_rate, importo_valuta,
    ibkr_transaction_id, ibkr_trade_id, descrizione, documento_grezzo_id
  ) values (
    '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, 'trade',
    '2025-05-19'::date, '2025-05-21'::date, 'BOND', 'OAT0.5%25MAY72', 'FR0014001NN8', '466846182',
    -4000, 29.15, 1, 1165, 'EUR', 1, 1165,
    '4083257342', '1034408298',
    'FRTR 0 1/2 05/25/2072 — vendita recuperata da riconciliazione OpenPosition (mancante nel backfill originale per collisione transactionID con CashTransaction collegato)',
    null
  ) returning id
)
insert into public.tax_movements (conto_id, user_id, movimento_id, instrument_id, tipo, data, quantita, prezzo_eur, importo_eur, commissioni_eur, ibkr_transaction_id, ibkr_trade_id)
select '381ed8ac-3540-4ffc-a0a3-99f790ac7d29'::uuid, '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, v4.id,
  '675a6e58-457e-4396-8b3c-0556862cff89'::uuid, 'vendita', '2025-05-19'::date, -4000, 29.15, 1165, 1, '4083257342', '1034408298'
from v4;

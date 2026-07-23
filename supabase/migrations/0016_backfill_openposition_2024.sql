-- Backfill snapshot OpenPosition di fine 2024, mancante in posizioni_aperte_ibkr
-- (ibkr-flex-pull aveva ingerito solo lo snapshot di fine 2025). Necessario per il
-- dettaglio RW riga per riga (calcola-quadro-rw-dettaglio): senza questo snapshot il
-- "valore inizio periodo" del 2025 risultava sempre NULL per gli strumenti detenuti
-- gia' a fine 2024. Estratto a mano da BUDGETING_2024.xml (sezione <OpenPosition>,
-- reportDate="20241231", 10 righe) — stesso file gia' usato per il backfill storico
-- di movimenti/tax_movements, vedi ROADMAP.md "Debito di archiviazione".
insert into public.posizioni_aperte_ibkr
  (user_id, conto_id, conid, isin, symbol, asset_category, sub_category, report_date, position,
   mark_price, position_value_eur, cost_basis_price, cost_basis_money_eur,
   fifo_pnl_unrealized_eur, side, valuta, fx_rate)
values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '314449651', 'LU1681038243', 'ANX', 'STK', 'ETF', '2024-12-31', 30, 233.1, 6993.00, 203.590363333, 6107.7109, 885.2891, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '41015909', 'GB00B15KXQ89', 'COPA', 'STK', 'ETF', '2024-12-31', 72, 35.1476454, 2530.6304688, 36.78531468931816, 2648.5426576, -117.9121888, 'Long', 'USD', 0.96586),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '368504689', 'FR0013416716', 'GOLD', 'STK', 'ETF', '2024-12-31', 10, 99.826, 998.26, 73.804, 738.04, 260.22, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '41600849', 'FR0010361683', 'INR', 'STK', 'ETF', '2024-12-31', 199.3313, 30.911, 6161.53, 30.569070944, 6093.372651, 68.157349, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '352913633', 'IE00BGDQ0L74', 'IPRE', 'STK', 'ETF', '2024-12-31', 1118.5682, 4.3935, 4914.43, 4.472682, 5002.999854, -88.569854, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '466846182', 'FR0014001NN8', 'OAT0.5%MAY72', 'BOND', 'Govt', '2024-12-31', 8000, 34.286, 2742.88, 36.5, 2920, -177.12, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '42922175', 'GB00B15KY328', 'SLVRP', 'STK', 'ETF', '2024-12-31', 65, 23.667, 1538.36, 24.342153846, 1582.24, -43.88, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '234004667', 'NL0011683594', 'TDIV', 'STK', 'ETF', '2024-12-31', 53, 40.14, 2127.42, 36.706603774, 1945.45, 181.97, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '667588588', 'LU2673523564', 'XB33', 'STK', 'ETF', '2024-12-31', 216.1108, 28.575, 6175.37, 28.254032732, 6106.001617, 69.368383, 'Long', 'EUR', 1),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '381ed8ac-3540-4ffc-a0a3-99f790ac7d29', '139185348', 'IE00BCBJG560', 'ZPRS', 'STK', 'ETF', '2024-12-31', 31.7493, 102.64, 3258.75, 94.584490272, 3002.991357, 255.758643, 'Long', 'EUR', 1)
on conflict (conto_id, conid, report_date) do nothing;

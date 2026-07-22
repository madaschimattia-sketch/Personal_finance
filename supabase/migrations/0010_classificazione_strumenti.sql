-- Classificazione fiscale (is_oicr / is_titolo_stato_whitelist / classificazione_confermata)
-- per i 25 strumenti rimasti non confermati dopo il backfill. Proposta dall'assistente,
-- confermata dall'utente in sessione; verificata via web search per i casi meno ovvi
-- (WisdomTree Physical Bitcoin, Amundi Physical Gold ETC, Amundi VIX Futures ETF,
-- Xtrackers MSCI EM ETF, Carlyle Secured Lending BDC), estesa per pattern agli altri
-- fondi UCITS dello stesso tipo di emittente/struttura — vedi docs/decisioni-fiscali.md
-- per il dettaglio del ragionamento e le fonti.
--
-- Gruppo A — non OICR, non whitelist (azioni/ADR/BDC/opzione/ETC fisici su commodity):
-- gli ETC (GOLD/WBTC/SLVRP/COPAl) sono debt security/ETP con UCITS-eligibility ma NON
-- UCITS-compliant (fonte: pagine prodotto WisdomTree/Amundi) — non sono organismi di
-- investimento collettivo, quindi non OICR ai fini fiscali italiani.
update public.tax_instruments
set is_oicr = false,
    is_titolo_stato_whitelist = false,
    classificazione_confermata = true,
    note = coalesce(note || ' | ', '') || 'is_oicr=false: azione/ADR/BDC/opzione oppure ETC (nota di debito fisicamente garantita, UCITS-eligible ma non UCITS-compliant) — confermato in sessione'
where id in (
  '002ebb8e-0db3-4d38-9c63-6440188c6849', -- AMD (azione)
  '7d6dd523-e4a4-483a-a858-387eab60f876', -- NVDA (azione)
  'b11f1056-a777-4f22-929f-639e45bb57a5', -- NNE (azione)
  '86826b17-22a0-44b2-a3fd-256fe2973bcf', -- XPEV (ADR)
  '238d94d3-5412-422a-9e9c-6b20fa5c16bb', -- CGBD (BDC USA, non UCITS/UE)
  '2418d1d1-d389-4bb4-b59a-11d593ba8a04', -- OKLO 241115C00025500 (opzione)
  '7e74b3ce-2463-4d60-a4ae-c64a42722eb1', -- GOLD (Amundi Physical Gold ETC)
  '82846bdd-f45a-49b1-a579-47ee79740195', -- WBTC (WisdomTree Physical Bitcoin ETC)
  '910e7ceb-7ca9-44bf-aa42-47da11a821e0', -- SLVRP (WisdomTree Physical Silver ETC)
  '2c28fdb9-21f4-4c68-a206-e48972e348a5'  -- COPAl (WisdomTree Physical Copper ETC)
);

-- Gruppo B — OICR (fondi UCITS armonizzati, domicilio IE/LU/NL/FR): proventi/plusvalenze
-- sempre imponibili in pieno, minusvalenze non compensabili (categoria_compensazione
-- 'oicr_non_compensabile' nel motore lotti).
update public.tax_instruments
set is_oicr = true,
    is_titolo_stato_whitelist = false,
    classificazione_confermata = true,
    note = coalesce(note || ' | ', '') || 'is_oicr=true: fondo UCITS armonizzato — confermato in sessione (verificato via web search per LVO/XMME, esteso per pattern agli altri fondi della stessa famiglia di emittenti)'
where id in (
  '1669391e-f7d4-40b6-aefb-37f996f494f7', -- 2B7D (iShares S&P 500 Consumer Staples UCITS ETF)
  '57f6ec03-77a6-46c6-8de3-48eeb1165703', -- ANX (Amundi Nasdaq-100 UCITS ETF)
  'dc25333e-8b19-482d-9a65-d3d0697cd036', -- E500 (Invesco S&P 500 UCITS ETF)
  '88dd6b7c-febe-469b-bc28-1a678c12b1f4', -- INR (Amundi MSCI India UCITS ETF)
  '5dacce4a-d969-4ae1-8cac-f4eae459791d', -- IPRE (iShares European Property Yield UCITS ETF)
  '236b7fe3-6788-4ac8-a0d7-53a199fa6098', -- LVO (Amundi S&P 500 VIX Futures Enhanced Roll UCITS ETF — verificato)
  'f8e256de-c432-4f12-8c4a-defa9229afab', -- MEUD (Amundi Core STOXX Europe 600 UCITS ETF)
  'e14c6998-3eb6-432f-a295-711cbe5fe657', -- QUTM (VanEck Quantum Computing UCITS ETF)
  '15319783-0779-493e-8e0c-06afc754388c', -- TDIV (VanEck Developed Markets Dividend Leaders UCITS ETF)
  'd68a9e35-f845-4519-b7f3-cf74aeca5907', -- VAGF (Vanguard Global Aggregate Bond UCITS ETF)
  '49473876-5ecc-4f09-b48d-aad861e698b4', -- XB33 (Xtrackers target maturity corporate bond UCITS ETF)
  '133bdadb-55b6-41d0-aacf-d5d43192f1c7', -- XHYG (Xtrackers EUR High Yield Corporate Bond UCITS ETF)
  '018e665d-e7d4-420b-9b39-dc95b75abac8', -- XMME (Xtrackers MSCI Emerging Markets UCITS ETF — verificato)
  '511681e4-8a89-4b7e-86e6-19c8edcc7034', -- XQUE (Xtrackers ESG EM Bond UCITS ETF)
  '40f989bb-ecac-4a84-b1d7-ebd74ecfa250'  -- ZPRS (SPDR MSCI World Small Cap UCITS ETF)
);

-- Portafoglio: raggruppamento per asset class (richiesto dall'utente, stile
-- LMadvisory). tax_instruments.asset_category e' il codice grezzo IBKR (STK/BOND/...)
-- — quasi tutto cio' che possediamo e' "STK" perche' gli ETF girano su IBKR come
-- azioni, quindi non e' utile per raggruppare. asset_class e' una classificazione
-- normalizzata (stessa tassonomia di LMadvisory: Equity/Fixed Income/Commodities/
-- Real Estate/Alternative/Multi-Asset/Liquidity/Other), derivata dalla descrizione
-- del fondo (descrizione IBKR, es. "X EUR HY CORP BOND" -> Fixed Income) — non da
-- una fonte verificata come un data provider, quindi va spot-checkata dall'utente
-- (vedi Fase Verifica in ROADMAP.md), specialmente i casi ambigui annotati sotto.
alter table public.tax_instruments
  add column if not exists asset_class text
    check (asset_class in ('Equity','Fixed Income','Commodities','Real Estate','Alternative','Multi-Asset','Liquidity','Other'));

comment on column public.tax_instruments.asset_class is 'Classificazione normalizzata per il raggruppamento in Portafoglio (Equity/Fixed Income/Commodities/Real Estate/Alternative/Multi-Asset/Liquidity/Other) — derivata dalla descrizione del fondo, non da un data provider verificato: da confermare (vedi Fase Verifica).';

update public.tax_instruments set asset_class = 'Fixed Income' where symbol in ('OAT0.5%25MAY72', 'XB33', 'XHYG', 'XQUE');
update public.tax_instruments set asset_class = 'Commodities' where symbol in ('COPAP', 'GOLD');
update public.tax_instruments set asset_class = 'Alternative' where symbol in ('BTCWUSD', 'IB1T'); -- Bitcoin ETC/ETP — verificare se preferisci un bucket "Crypto" dedicato invece di Alternative
update public.tax_instruments set asset_class = 'Real Estate' where symbol in ('IPRE');
update public.tax_instruments set asset_class = 'Equity' where symbol in ('CGBD', '2B7D', 'ANX', 'E500', 'INR', 'MEUD', 'QUTM', 'TDIV', 'XMME', 'ZPRS'); -- CGBD e' un BDC (Carlyle Secured Lending): common stock ma profilo simile a private credit, verificare se preferisci Alternative

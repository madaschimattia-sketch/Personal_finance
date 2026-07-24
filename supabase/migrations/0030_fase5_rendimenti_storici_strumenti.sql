-- Fase 5 — ESPERTO DI FINANZA, raffinamento proiezioni: rendimento storico REALE
-- per singolo strumento in portafoglio (~5 anni, CAGR su prezzi Yahoo Finance),
-- pesato per il valore di posizione attuale — sostituisce, dove disponibile, le
-- ipotesi generiche per categoria di config_rendimenti_attesi (che restano
-- fallback per gli strumenti senza dato risolto/disponibile).
--
-- yahoo_ticker: stesso pattern di override manuale di etf_master.yahoo_ticker in
-- LMadvisory — qui tax_instruments non ha una colonna "exchange" da cui derivare
-- un ticker_exchange generato, quindi il ticker Yahoo viene risolto per ISIN alla
-- prima esecuzione di calcola-rendimenti-storici e qui CACHATO (colonna
-- sovrascrivibile a mano se la risoluzione automatica sbaglia strumento).
alter table public.tax_instruments
  add column if not exists yahoo_ticker text,
  add column if not exists rendimento_5y_pct numeric,
  add column if not exists anni_dati_disponibili numeric,
  add column if not exists rendimento_5y_calcolato_il timestamptz;

comment on column public.tax_instruments.yahoo_ticker is 'Ticker Yahoo Finance risolto per ISIN da calcola-rendimenti-storici (o inserito a mano se la risoluzione automatica sceglie lo strumento sbagliato — collisioni di simbolo sono possibili, es. "GOLD" non è univoco).';
comment on column public.tax_instruments.rendimento_5y_pct is 'CAGR storico calcolato sui prezzi Yahoo Finance disponibili (fino a 5 anni, meno se lo strumento è più recente — vedi anni_dati_disponibili). NULL se la risoluzione del ticker o il fetch dei prezzi falliscono: le proiezioni Fase 5 usano in quel caso il fallback per categoria (config_rendimenti_attesi).';
comment on column public.tax_instruments.anni_dati_disponibili is 'Anni di storico prezzi realmente usati per calcolare rendimento_5y_pct (< 5 se lo strumento è quotato da meno tempo) — sotto 2 anni il calcolo viene scartato per bassa significatività.';

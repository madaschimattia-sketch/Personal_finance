-- sub_category IBKR (es. 'ETF', 'COMMON', 'ADR', 'Govt', 'C'/'P' opzioni): segnale oggettivo
-- della fonte per distinguere ETF/OICR (media ponderata) da azioni/obbligazioni/opzioni
-- (LIFO), coerente con la regola dell'utente. Non e' un giudizio fiscale nostro: e' il
-- campo che IBKR stesso valorizza in SecurityInfo/Trade.
alter table public.tax_instruments
  add column if not exists sub_category text;

comment on column public.tax_instruments.sub_category is 'subCategory IBKR (ETF, COMMON, ADR, Govt, C/P...) — guida la scelta metodo_costo, non sostituisce classificazione_confermata.';

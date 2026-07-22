-- Collegamento opzione -> sottostante (informativo) + tracciamento evento IBKR
-- (OptionEAE.transactionType: Exercise/Assignment/Expiration) sul movimento fiscale
-- di chiusura. Solo 'expiration' segue il trattamento standalone attuale del motore
-- lotti; 'exercise'/'assignment' vanno segnalati per revisione manuale (il premio
-- potrebbe dover essere redistribuito sul lotto del sottostante — non ancora
-- automatizzato, vedi docs/decisioni-fiscali.md).
alter table public.tax_instruments
  add column if not exists underlying_conid text,
  add column if not exists underlying_isin text,
  add column if not exists underlying_symbol text;

alter table public.tax_movements
  add column if not exists evento_opzione text
    check (evento_opzione is null or evento_opzione in ('exercise','assignment','expiration'));

comment on column public.tax_movements.evento_opzione is 'Da IBKR OptionEAE.transactionType per movimenti di chiusura opzione. exercise/assignment = revisione manuale necessaria (redistribuzione premio sul sottostante non automatizzata); expiration = trattamento standalone attuale.';

-- backfill dell'unico caso storico presente (OKLO, gia' verificato come Expiration
-- dal campo transactionType nell'XML originale)
update public.tax_instruments
set underlying_conid = '500073396', underlying_isin = 'US02156V1098', underlying_symbol = 'OKLO'
where conid = '739504826';

update public.tax_movements
set evento_opzione = 'expiration'
where ibkr_trade_id = '867517603' and tipo = 'vendita';

-- Fonte prezzo di fallback per ISIN che Yahoo Finance non risolve (bond/fondi
-- non quotati lì, tipicamente MOT/EuroTLX) — l'utente conferma esplicitamente
-- l'URL scheda di borsaitaliana.it per lo strumento (mai indovinato/cercato in
-- automatico: un match sbagliato scriverebbe il prezzo di un altro strumento).
-- sync-prezzi-conti-amministrati lo usa solo quando la risoluzione Yahoo fallisce.
alter table public.tax_instruments
  add column if not exists borsaitaliana_url text;

comment on column public.tax_instruments.borsaitaliana_url is 'URL scheda borsaitaliana.it (MOT/EuroTLX) confermato dall''utente, usato come fallback prezzo quando Yahoo Finance non risolve l''ISIN. Mai popolato automaticamente.';

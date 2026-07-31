-- URL scheda borsaitaliana.it confermati esplicitamente dall'utente per i 2 ISIN
-- rimasti senza fallback (vedi migration 0044 per FR0014001NN8) — Yahoo Finance
-- non risolve nessuno dei tre. Verificato: nome strumento e prezzo coincidono
-- con quanto mostrato dalle rispettive pagine (Romania 5.25% 2032 = 101,49 EUR,
-- Ms Global Opportunity A Usd Acc = 136,67 EUR).
update public.tax_instruments
set borsaitaliana_url = 'https://www.borsaitaliana.it/borsa/obbligazioni/mot/euro-obbligazioni/scheda/XS2829209720-MOTX.html?lang=it'
where isin = 'XS2829209720';

update public.tax_instruments
set borsaitaliana_url = 'https://www.borsaitaliana.it/borsa/fondi/dettaglio/2FADB100678.html'
where isin = 'LU0552385295';

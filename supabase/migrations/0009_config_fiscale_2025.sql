-- config_fiscale_parametri era seminata solo per il 2026 (migration 0002). Il quadro RT
-- si calcola ora per il 2025 (dichiarazioni_fiscali.stato='in_preparazione'), quindi serve
-- una riga per anno=2025. Stessi valori del 2026 (le aliquote 26%/12,5% e il carryforward
-- a 4 anni sono stabili da anni), ma verificato=false come per il 2026: sono valori
-- storicamente noti, non un'asserzione che siano quelli corretti senza conferma.
insert into public.config_fiscale_parametri (anno, chiave, valore, descrizione, verificato) values
  (2025, 'aliquota_capital_gain_ordinaria_pct', 26.0, 'Aliquota su plusvalenze/redditi di capitale ordinari', false),
  (2025, 'aliquota_whitelist_titoli_stato_pct', 12.5, 'Aliquota agevolata titoli di stato whitelist', false),
  (2025, 'ivafe_proporzionale_pct', 0.2, 'IVAFE proporzionale su prodotti finanziari esteri', false),
  (2025, 'ivafe_cash_fissa_eur', 34.20, 'IVAFE fissa su liquidita'' estera (regime fisso, analogo bollo c/c)', false),
  (2025, 'ivafe_cash_soglia_giacenza_media_eur', 5000, 'Soglia giacenza media annua sotto cui l''IVAFE fissa cash non e'' dovuta', false),
  (2025, 'minusvalenze_anni_carryforward', 4, 'Anni di riportabilita'' delle minusvalenze (art. 68 TUIR)', false)
on conflict (anno, chiave) do nothing;

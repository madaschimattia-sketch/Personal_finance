-- calcola-quadro-rw richiede config_fiscale_parametri per l'anno richiesto,
-- ma la tabella aveva solo 2025/2026 (l'app ha iniziato a tracciare i conti
-- IBKR di recente). Il fondo AXA esiste dal 2022: senza questi parametri il
-- calcolo RW per 2022/2023/2024 fallisce con "Parametri IVAFE mancanti".
--
-- Le aliquote IVAFE (2‰ proporzionale, 34,20€ fissa oltre 5.000€ di giacenza
-- media cassa) sono stabili dal 2014 (art. 19 D.L. 201/2011 e successive
-- modifiche) — stessi valori di 2025/2026 già in tabella. Backfillate qui con
-- verificato=false, stesso pattern già usato per il 2025 (ROADMAP Fase
-- Verifica): valori storicamente plausibili, non confermati da fonte
-- ufficiale specifica per ciascun anno.
insert into public.config_fiscale_parametri (anno, chiave, valore, descrizione, verificato)
values
  (2022, 'ivafe_proporzionale_pct', 0.2, 'IVAFE proporzionale su prodotti finanziari esteri', false),
  (2022, 'ivafe_cash_fissa_eur', 34.20, 'IVAFE fissa cash (regime bollo conto corrente)', false),
  (2022, 'ivafe_cash_soglia_giacenza_media_eur', 5000, 'Soglia giacenza media cash per IVAFE fissa', false),
  (2023, 'ivafe_proporzionale_pct', 0.2, 'IVAFE proporzionale su prodotti finanziari esteri', false),
  (2023, 'ivafe_cash_fissa_eur', 34.20, 'IVAFE fissa cash (regime bollo conto corrente)', false),
  (2023, 'ivafe_cash_soglia_giacenza_media_eur', 5000, 'Soglia giacenza media cash per IVAFE fissa', false),
  (2024, 'ivafe_proporzionale_pct', 0.2, 'IVAFE proporzionale su prodotti finanziari esteri', false),
  (2024, 'ivafe_cash_fissa_eur', 34.20, 'IVAFE fissa cash (regime bollo conto corrente)', false),
  (2024, 'ivafe_cash_soglia_giacenza_media_eur', 5000, 'Soglia giacenza media cash per IVAFE fissa', false);

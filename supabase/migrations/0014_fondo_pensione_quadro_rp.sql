-- Motore fondi pensione — deduzione versamenti (quadro RP / oneri deducibili).
--
-- Copre SOLO la deduzione dei versamenti (tetto 5.164,57 EUR/anno, art. 10 comma 1
-- lett. e-bis TUIR): le altre due componenti del backlog restano fuori scope per
-- design, non per dimenticanza —
--   - imposta sostitutiva sul rendimento: gia' trattenuta dal fondo stesso (non e'
--     un adempimento dell'aderente, nessun calcolo nostro necessario);
--   - tassazione in uscita (aliquota 15%->9% per anni di iscrizione): rilevante solo
--     al momento di un riscatto/rendita effettivo, che non e' ancora accaduto (nessun
--     fondo_pensione_posizione/versamenti popolato). La funzione di calcolo
--     dell'aliquota e' comunque implementata (pura, pronta all'uso) in
--     fondo-pensione.ts, ma non produce alcun evento finche' non c'e' un riscatto reale.
--
-- tax_events.quadro esteso a 'RP' (oneri deducibili): stesso schema di RT/RM/RW, con
-- imponibile_eur = importo dedotto, aliquota_pct sempre null e imposta_eur sempre 0
-- (la deduzione riduce la base imponibile IRPEF al netto della fascia dell'aderente,
-- non genera un risparmio d'imposta calcolabile senza conoscere l'aliquota marginale
-- della persona — fuori scope, non modellata).
alter table public.tax_events drop constraint if exists tax_events_quadro_check;
alter table public.tax_events add constraint tax_events_quadro_check
  check (quadro in ('RT', 'RM', 'RW', 'RP'));

insert into public.config_fiscale_parametri (anno, chiave, valore, descrizione, verificato) values
  (2025, 'tetto_deduzione_fondo_pensione_eur', 5164.57, 'Tetto deducibilita'' annua versamenti a previdenza complementare (art. 10 c.1 lett. e-bis TUIR)', false),
  (2026, 'tetto_deduzione_fondo_pensione_eur', 5164.57, 'Tetto deducibilita'' annua versamenti a previdenza complementare (art. 10 c.1 lett. e-bis TUIR)', false)
on conflict (anno, chiave) do nothing;

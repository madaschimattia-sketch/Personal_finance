-- Fase 4 — BUDGET: primo popolamento di spese_fisse_manuali con i dati reali
-- forniti dall'utente. Storico gestito dal 01/01/2024 per coerenza con
-- INVESTIMENTI (l'utente ha scelto esplicitamente di non andare a ritracciare le
-- notifiche di pagamento precedenti). RC auto/Bollo auto e Canone conto NON
-- inserite: l'utente non sta pagando l'auto (a suo carico non oggi) e ha solo
-- conti correnti gratuiti — le categorie 'veicolo' e 'bancario' restano valide
-- nel CHECK per un uso futuro, semplicemente senza righe ad oggi.
--
-- HoMobile (piano telefonico cellulare) non ha una categoria dedicata
-- nell'enum: è personale e segue la persona (non il domicilio), a differenza
-- di utenze_bollette.categoria='internet_telefono' che resta per l'internet
-- fisso di casa — coerente con la nota già in migration 0026. Categorizzata
-- 'altro' con nome esplicito, senza estendere l'enum per una sola voce.
insert into public.spese_fisse_manuali
  (user_id, intestatario_id, nome, categoria, importo, frequenza, data_inizio, attivo)
values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '37af7f90-79d8-42e6-b172-367ccbd38846',
   'Spotify Family', 'streaming', 20.99, 'mensile', '2024-01-01', true),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '37af7f90-79d8-42e6-b172-367ccbd38846',
   'Anthropic (Claude)', 'software', 21.96, 'mensile', '2024-01-01', true),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '37af7f90-79d8-42e6-b172-367ccbd38846',
   'HoMobile (piano telefonico cellulare)', 'altro', 5.99, 'mensile', '2024-01-01', true);

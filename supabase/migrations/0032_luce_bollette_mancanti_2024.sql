-- Colma il buco mar-dic 2024 nelle bollette luce, scoperto dall'utente confrontando
-- il grafico con le fatture reali su Drive (cartella IBKR... ops, cartella Utenze/Luce).
-- 3 bollette bimestrali regolari mai ingerite (mag-giu, lug-ago, set-ott 2024) + una
-- bolletta di CHIUSURA CONTRATTO (01 nov - 09 dic 2024) che spiega perche' la riga
-- "dic '24" gia' in tabella parte dal 10 dicembre: il contratto A2A e' stato chiuso e
-- riaperto il 9/10 dicembre 2024 (verosimilmente un rinnovo tariffario), da cui due
-- fatture consecutive invece di un'unica bimestrale nov-dic.
--
-- La bolletta di chiusura (255,20€, 311 kWh) include €124,08 di oneri una tantum
-- (Contributo allacciamento €101,08 + Diritto Fisso vendita €23,00) non legati al
-- consumo energetico ricorrente — lasciata con frequenza 'bimestrale' (il consumo
-- energetico del periodo e' reale e va nel calcolo ricorrente) ma annotata in nota
-- per trasparenza, cosi' il costo/kWh anomalo di questo periodo nei grafici e'
-- spiegato invece di sembrare un errore di dati.
insert into public.utenze_bollette
  (user_id, domicilio_id, categoria, fornitore, data_emissione, periodo_da, periodo_a, importo, consumo, unita_misura, frequenza, note)
values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '9d66827f-d2f6-42c4-b372-1d1c3467e27d', 'luce', 'A2A Energia',
   '2024-07-26', '2024-05-01', '2024-06-30', 135.68, 380, 'kWh', 'bimestrale', null),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '9d66827f-d2f6-42c4-b372-1d1c3467e27d', 'luce', 'A2A Energia',
   '2024-09-24', '2024-07-01', '2024-08-31', 117.68, 257, 'kWh', 'bimestrale', null),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '9d66827f-d2f6-42c4-b372-1d1c3467e27d', 'luce', 'A2A Energia',
   '2024-11-21', '2024-09-01', '2024-10-31', 123.81, 325, 'kWh', 'bimestrale', null),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '9d66827f-d2f6-42c4-b372-1d1c3467e27d', 'luce', 'A2A Energia',
   '2025-01-07', '2024-11-01', '2024-12-09', 255.20, 311, 'kWh', 'bimestrale',
   'Bolletta di CHIUSURA CONTRATTO (rinnovo tariffario 9/10 dic 2024): include 124,08€ di oneri una tantum (contributo allacciamento 101,08€ + diritto fisso vendita 23,00€) non legati al consumo energetico ricorrente. Costo/kWh di questo periodo nei grafici è quindi più alto del normale per questo motivo, non per un errore di dati.');

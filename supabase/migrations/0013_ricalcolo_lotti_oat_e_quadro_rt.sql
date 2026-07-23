-- Ricalcolo lotti OAT (LIFO) dopo il backfill delle 4 vendite mancanti (migration 0012)
-- + aggiornamento conseguente del quadro RT 2025 e di tax_loss_carryforward.
--
-- Calcolo verificato: la chiusura del 2024-11-07 (-9000, chiude interamente i lotti del
-- 2024-06-28) da' plus/minus -59,85 EUR, che coincide ESATTAMENTE col fifoPnlRealized
-- che IBKR stesso riporta per quel trade nell'XML originale — buona conferma indipendente
-- della metodologia (costo/ricavo a prezzo pulito, cedole maturate escluse e tassate a
-- parte come reddito di capitale, coerente con l'art. 67 TUIR).
--
-- Le 3 vendite del 2025-05-19 (-6000,-10000,-4000) precedono, nell'orario reale
-- dell'eseguito XML (04:42-04:42), l'acquisto di +8000 dello stesso giorno (05:24) —
-- l'ordine cronologico REALE (non solo la data, che il motore lotti usa come granularita'
-- di ordinamento) e' stato rispettato manualmente qui: le 3 vendite chiudono LIFO i lotti
-- del 2025-03-06 e 2025-01-08 (i piu' recenti disponibili PRIMA dell'acquisto dello stesso
-- giorno), non l'acquisto stesso. Il lotto del 2024-11-12 (il piu' vecchio) e il nuovo
-- lotto del 2025-05-19 restano aperti: 8.000 + 8.000 = 16.000 unita', che coincide con la
-- posizione OpenPosition di IBKR al 31/12/2025 — riconciliazione chiusa.

update public.tax_lots set quantita_residua = 0, stato = 'chiuso'
where id in (
  '8c1c5ddd-5f22-4555-8904-f98fb40b7784', -- acquisto 2024-06-28 (4000)
  'f0184d6b-022a-4db9-8ca5-d4cd374fa238', -- acquisto 2024-06-28 (5000)
  '4e7718d0-126f-4c88-ae79-e57678b58818', -- acquisto 2025-01-08 (12000)
  '5ee9404b-ca82-451f-ab00-bfcd540903d1'  -- acquisto 2025-03-06 (8000)
);

insert into public.tax_lot_closures (user_id, lot_id, vendita_movement_id, data_chiusura, quantita_chiusa, costo_eur, ricavo_eur, plus_minus_eur, giorni_detenzione, categoria_compensazione) values
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'f0184d6b-022a-4db9-8ca5-d4cd374fa238', '20fa08c9-6819-4f77-8496-8841136474d7', '2024-11-07', 5000, 1784.75, 1751.5, -33.25, 132, 'whitelist'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '8c1c5ddd-5f22-4555-8904-f98fb40b7784', '20fa08c9-6819-4f77-8496-8841136474d7', '2024-11-07', 4000, 1427.8, 1401.2, -26.6, 132, 'whitelist'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '5ee9404b-ca82-451f-ab00-bfcd540903d1', 'b6bbfc15-2b71-4780-8552-486d13efa26b', '2025-05-19', 6000, 1771.62, 1744.8, -26.82, 74, 'whitelist'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '5ee9404b-ca82-451f-ab00-bfcd540903d1', '371d84ec-b034-4c72-a46c-4906523355bd', '2025-05-19', 2000, 590.54, 582.5, -8.04, 74, 'whitelist'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '4e7718d0-126f-4c88-ae79-e57678b58818', '371d84ec-b034-4c72-a46c-4906523355bd', '2025-05-19', 8000, 2638.2, 2330, -308.2, 131, 'whitelist'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', '4e7718d0-126f-4c88-ae79-e57678b58818', '393bbbd1-7aa0-4665-b68e-de64f163290c', '2025-05-19', 4000, 1319.1, 1165, -154.1, 131, 'whitelist');

-- tax_loss_carryforward whitelist 2025: sostituisce il valore provvisorio (103,74 EUR,
-- solo T-bond) con il totale corretto (T-bond + OAT: 103,74 + 497,16 = 600,90 EUR).
delete from public.tax_loss_carryforward where user_id = '1af33662-2dea-49b0-b7d6-ffe2bba781f5' and anno_origine = 2025 and categoria = 'whitelist';
insert into public.tax_loss_carryforward (user_id, anno_origine, anno_scadenza, categoria, importo_originario_eur, importo_residuo_eur)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 2025, 2029, 'whitelist', 600.90, 600.90);

-- Quadro RT 2025: invariato nell'imposta totale (le minus whitelist non compensano
-- nulla nel 2025 stesso, solo riporto), ma la nota ora riflette entrambe le vendite
-- recuperate.
delete from public.tax_events where user_id = '1af33662-2dea-49b0-b7d6-ffe2bba781f5' and anno = 2025 and quadro = 'RT';
insert into public.tax_events (user_id, conto_id, anno, quadro, tipo, riferimento_id, imponibile_eur, aliquota_pct, imposta_eur, note) values
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 2025, 'RT', 'plusvalenza_ordinaria', null, 3952.21, 26.0, 1027.57,
 'Plusvalenze lorde 3952.21 EUR, minusvalenze lorde dell''anno 0.00 EUR, saldo 3952.21 EUR, minusvalenze pregresse compensate 0.00 EUR.'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 2025, 'RT', 'plusvalenza_oicr', null, 31.34, 26.0, 8.15,
 'Provento OICR (redditi di capitale): imponibile in pieno, nessuna compensazione con minusvalenze correnti o pregresse.'),
('1af33662-2dea-49b0-b7d6-ffe2bba781f5', null, 2025, 'RT', 'minusvalenza_whitelist_riportata', null, 0, null, 0,
 'Minusvalenza netta dell''anno 600.90 EUR (plus 0.00, minus 600.90), riportabile nei 4 anni successivi. Include le vendite OAT del 2025-05-19 (-497.16 EUR) e la vendita T-bond USA del 2025-09-30 (-103.74 EUR), entrambe recuperate via riconciliazione OpenPosition.');

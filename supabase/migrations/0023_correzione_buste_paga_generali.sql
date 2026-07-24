-- Correzione completa di migration 0022: l'utente ha caricato molte più buste paga
-- di quanto risultasse (38 documenti, luglio 2023 -> giugno 2026, non 10) e ha fornito
-- uno screenshot della busta paga di maggio 2026 che rivela la struttura esatta delle
-- colonne del cedolino Generali (Imponibili/Contributi INPS, Imponibile Fiscale/IRPEF
-- lorda, TFR Previd. Mese, Totale Trattenute, Totale Competenze) — struttura confermata
-- anche dal contenuto testuale del file "202501 - Generali.pdf" (risultato illeggibile
-- come dati, ma la sua intestazione elenca le stesse colonne nello stesso ordine).
--
-- Correzioni rispetto a 0022:
--   1) "lordo" ora e' il "Totale Competenze" ufficiale del cedolino (include eventuali
--      rimborsi/indennita' non ovvi), non piu' una somma manuale di RLM + voci
--      variabili scelte a occhio — es. maggio 2026 era 5.325,19€ in 0022, ora
--      5.560,69€ (include rimborsi welfare non individuati prima).
--   2) IRPEF e contributi INPS: prima lasciati null per l'intero dataset (non
--      isolabili dal testo compresso); ora popolati per 30 righe su 38, usando le
--      colonne dedicate confermate dallo screenshot. Le 8 righe rimaste null
--      (aprile-novembre 2024) hanno un'anomalia strutturale nel testo estratto (il
--      blocco IRPEF mensile e' sostituito dagli stessi valori cumulativi
--      progressivi per 8 mesi consecutivi, probabile blocco/regolarizzazione fiscale
--      nel sistema payroll di quel periodo) — lasciato null anziche' fabbricato.
--   3) Dicembre: prima modellato come UNA riga per anno (assumendo che il cedolino di
--      dicembre nettasse l'anticipo tredicesima). L'utente ha confermato che sono
--      **due pagamenti reali separati, entrambi incassati** — ora modellati come due
--      righe distinte per ogni dicembre (2023, 2024, 2025): tredicesima (anticipata
--      a metà mese) + cedolino di fine mese (che ricalcola comunque la tredicesima
--      nel proprio cumulativo interno, ma il netto stampato su ciascun documento e'
--      un incasso reale a se'), analisi confermata numericamente confrontando i tre
--      anni (il rapporto tra "Acconti" e trattenute non torna se si ipotizza una
--      sottrazione, mentre torna esattamente se si trattano come due incassi pieni).
--   4) Copertura estesa da 9 a 38 righe: luglio 2023 (assunzione) -> giugno 2026,
--      con l'unica lacuna gennaio 2025 (PDF caricato illeggibile come dati, solo
--      intestazione colonne — probabile scansione non testuale).
--
-- Metodologia (per le righe non anomale): irpef_trattenuta e contributi_inps letti
-- dalle rispettive colonne dedicate del cedolino; altre_trattenute = Totale Trattenute
-- (colonna dedicata) meno irpef meno inps, cosi' la somma dei tre campi riconcilia
-- sempre esattamente col Totale Trattenute ufficiale del documento (verificato caso
-- per caso, non assunto).

delete from public.introiti_buste_paga
where intestatario_id = (select id from public.intestatari where codice_fiscale = 'MDSMTT94A12A246E');

insert into public.introiti_buste_paga
  (user_id, intestatario_id, datore_lavoro, periodo_da, periodo_a, data_pagamento, lordo, netto, irpef_trattenuta, contributi_inps, tfr_maturato, altre_trattenute, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5', i.id, 'Generali Investments Holding S.p.A.',
       v.periodo_da::date, v.periodo_a::date, v.data_pagamento::date,
       v.lordo::numeric, v.netto::numeric, v.irpef::numeric, v.inps::numeric, v.tfr::numeric, v.altre::numeric, v.note
from public.intestatari i
cross join (values
('2023-07-01','2023-07-31','2023-07-27','2283.19','1585.92','497.88','197.95',null,'1.44','Metodologia: lordo=Totale Competenze, irpef/inps=colonne dedicate del cedolino (schema confermato da screenshot utente), altre_trattenute=Totale Trattenute - irpef - inps. Primo mese (assunzione 17/07/2023), sede Lussemburgo.'),
('2023-08-01','2023-08-31','2023-08-25','4915.61','3085.42','1369.45','451.78',null,'8.96',null),
('2023-09-01','2023-09-30','2023-09-27','4615.61','2931.96','1253.68','424.21',null,'5.76',null),
('2023-10-01','2023-10-31','2023-10-27','4615.61','2931.96','1253.68','424.21',null,'5.76',null),
('2023-11-01','2023-11-30','2023-11-27','4615.61','2931.96','1253.68','424.21',null,'5.76',null),
('2023-12-01','2023-12-31','2023-12-27','11522.38','6095.36','2920.75','780.97','1027.67','1725.30','Cedolino di dicembre: include tredicesima+Una Tantum CCNL ricalcolati nel cumulativo del mese, oltre al normale stipendio. Pagamento SEPARATO e aggiuntivo rispetto alla riga "tredicesima" sotto (confermato dall''utente: entrambi gli importi sono stati incassati).'),
('2023-12-01','2023-12-31','2023-12-20','2438.38','1685.60','540.77','224.06',null,null,'Tredicesima mensilità, anticipata separatamente rispetto al cedolino di dicembre (riga sopra). Blocco "Contributi" di questo documento presenta un''anomalia (-13,68 non riconciliabile con sicurezza): altre_trattenute lasciato null per non fabbricare un numero inaffidabile.'),
('2024-01-01','2024-01-31','2024-01-26','4879.68','3072.01','1324.25','448.47','337.06','34.95',null),
('2024-02-01','2024-02-29','2024-02-27','5179.68','3225.40','1439.96','476.04','335.56','38.28',null),
('2024-03-01','2024-03-31','2024-03-27','6952.80','4132.42','2124.20','638.98','480.02','57.20','Include bonus STI 2.070€ (comunicato con lettera separata, non un pagamento aggiuntivo — già incluso nel lordo di questo cedolino).'),
('2024-04-01','2024-04-30','2024-04-26','4879.68','4396.12',null,'448.48','337.06','35.08','IRPEF non isolabile: il blocco "Imponibile Fiscale/IRPEF lorda" mensile è assente dal testo estratto, sostituito dagli stessi valori cumulativi progressivi di aprile-novembre 2024 (probabile blocco/regolarizzazione fiscale prolungata nel sistema payroll di questo periodo) — lasciato null anziché fabbricato.'),
('2024-05-01','2024-05-31','2024-05-27','4879.68','4396.13',null,'448.47','337.06','35.08','Stessa anomalia IRPEF di aprile 2024 (vedi nota).'),
('2024-06-01','2024-06-30','2024-06-27','6127.55','5471.87',null,'563.16','330.82','92.52','Stessa anomalia IRPEF di aprile 2024. Include Premio Az. Variabile 971,67€ tassato con imposta sostitutiva.'),
('2024-07-01','2024-07-31','2024-07-26','4879.68','4395.13',null,'448.47','337.06','36.08','Stessa anomalia IRPEF di aprile 2024.'),
('2024-08-01','2024-08-31','2024-08-27','4879.68','4395.12',null,'448.48','337.06','36.08','Stessa anomalia IRPEF di aprile 2024.'),
('2024-09-01','2024-09-30','2024-09-27','4985.31','4490.13',null,'458.12','344.35','37.06','Stessa anomalia IRPEF di aprile 2024.'),
('2024-10-01','2024-10-31','2024-10-25','4985.31','4490.13',null,'458.12','344.35','37.06','Stessa anomalia IRPEF di aprile 2024.'),
('2024-11-01','2024-11-30','2024-11-27','4985.31','4490.13',null,'458.12','344.35','37.06','Stessa anomalia IRPEF di aprile 2024 (ultimo mese: da dicembre 2024 il blocco IRPEF mensile torna leggibile).'),
('2024-12-01','2024-12-31','2024-12-27','14223.20','8324.57','676.80','916.06','688.51','4305.77','Cedolino di dicembre: include tredicesima ricalcolata nel cumulativo del mese, oltre al normale stipendio. Pagamento SEPARATO e aggiuntivo rispetto alla riga "tredicesima" sotto.'),
('2024-12-01','2024-12-31','2024-12-20','4982.39','4205.41','311.68','457.85',null,'7.45','Tredicesima mensilità, anticipata separatamente rispetto al cedolino di dicembre (riga sopra).'),
('2025-02-01','2025-02-28','2025-02-27','5385.31','4481.52','334.62','494.88','342.35','74.29','Gennaio 2025 non disponibile: il PDF caricato per quel mese conteneva solo l''intestazione delle colonne, non i dati (probabile scansione non testuale) — nessuna riga inserita per gennaio 2025.'),
('2025-03-01','2025-03-31','2025-03-27','4989.99','4146.70','310.14','458.58','344.33','74.57',null),
('2025-04-01','2025-04-30','2025-04-24','12177.54','10033.79','892.81','1119.16','824.74','131.78','Include retribuzione variabile 6.725€.'),
('2025-05-01','2025-05-31','2025-05-27','5240.99','4354.77','325.56','481.65','361.27','79.01',null),
('2025-06-01','2025-06-30','2025-06-27','6685.40','5585.33','327.31','614.35','358.16','158.41','Include Premio Az. Variabile 1.399€ tassato con imposta sostitutiva.'),
('2025-07-01','2025-07-31','2025-07-25','5286.40','4391.32','328.34','485.79','365.16','80.95',null),
('2025-08-01','2025-08-31','2025-08-27','5286.40','4392.32','328.34','485.78','365.16','79.96',null),
('2025-09-01','2025-09-30','2025-09-26','5286.40','4392.34','328.34','485.78','365.16','79.94',null),
('2025-10-01','2025-10-31','2025-10-27','5286.40','4392.32','328.34','485.79','365.16','79.95',null),
('2025-11-01','2025-11-30','2025-11-27','5286.40','4392.32','328.34','485.78','365.16','79.96',null),
('2025-12-01','2025-12-31','2025-12-24','13409.40','7133.79','736.81','971.38','730.10','4567.42','Cedolino di dicembre: include tredicesima ricalcolata nel cumulativo del mese, oltre al normale stipendio. Pagamento SEPARATO e aggiuntivo rispetto alla riga "tredicesima" sotto (confermato dall''utente: entrambi gli importi sono stati incassati).'),
('2025-12-01','2025-12-31','2025-12-19','5283.48','4437.61','328.89','485.51',null,'31.47','Tredicesima mensilità, anticipata separatamente rispetto al cedolino di dicembre (riga sopra).'),
('2026-01-01','2026-01-31','2026-01-27','5286.40','4396.30','328.38','485.78','365.16','75.94',null),
('2026-02-01','2026-02-28','2026-02-27','5286.40','4396.29','328.38','485.79','365.16','75.94',null),
('2026-03-01','2026-03-31','2026-03-27','5329.87','4432.28','331.05','489.82','367.81','76.72','Retribuzione tabellare aumentata da marzo 2026. Include "Una Tantum in Welfare" 300€ non tassata come reddito ordinario.'),
('2026-04-01','2026-04-30','2026-04-27','15176.29','12503.51','1154.59','1386.32','1011.62','131.87','Include retribuzione variabile (STI) 9.350€ + indennità forfettaria 410€.'),
('2026-05-01','2026-05-31','2026-05-27','5560.69','4663.88','330.77','489.36','367.83','76.68','Lordo (Totale Competenze) include rimborsi/welfare oltre alla retribuzione base — vedi screenshot di riferimento fornito dall''utente per la struttura del cedolino.'),
('2026-06-01','2026-06-30','2026-06-26','8460.77','7237.55','328.60','759.83','353.12','134.79','Include Premio Az. Variabile 2.943€ tassato con imposta sostitutiva.')
) as v(periodo_da, periodo_a, data_pagamento, lordo, netto, irpef, inps, tfr, altre, note)
where i.codice_fiscale = 'MDSMTT94A12A246E';

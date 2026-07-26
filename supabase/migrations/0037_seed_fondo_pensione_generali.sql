-- Secondo fondo pensione popolato da documenti reali (cartella Drive
-- BUDGETING/05_FONDO_PENSIONE/2023_Generali_Italy): F.P.G.G. — Fondo Pensione
-- dei Dipendenti delle società del Gruppo Generali, fondo preesistente italiano
-- (Albo COVIP sez. Fondi Pensione Preesistenti, n° 1109), adesione collettiva
-- 22.11.2023. Istituito in Italia -> is_estero=false (a differenza di AXA
-- Lussemburgo in 0036). tipo='fondo_chiuso_negoziale' (fondo aziendale/di
-- categoria, non aperto ne' PIP).
--
-- 3 documenti coperti: Prospetto 2023 (posizione al 31/12/2023), Prospetto
-- 2024 (posizione al 31/12/2024, dettaglio mensile versamenti), Estratto conto
-- al 31/12/2025 (dettaglio mensile ma senza rendimento separato). Versamenti
-- aggregati per anno/tipo (non riga per riga mensile) per restare sullo stesso
-- livello di dettaglio del fondo AXA e di quanto serve al calcolo RP.
--
-- Split per tipo_versamento come da CHECK esistente: contributo lavoratore
-- (volontario), contributo datore di lavoro (mai deducibile per il lavoratore),
-- TFR conferito (mai deducibile, regime fiscale proprio, fuori dal plafond RP).
-- Esclusi i "contributi aggiuntivi del datore di lavoro per spese di
-- funzionamento del fondo" (2,71€ nel 2023, 35,52€ nel 2024): non entrano nella
-- posizione individuale, sono un costo amministrativo a carico del datore.
--
-- Il prospetto 2024 dichiara esplicitamente 326,88€ (su 349,64€ di contributo
-- lavoratore) come "contributi versati e non dedotti" — dato comunicato
-- dall'aderente al fondo stesso, quindi affidabile. Deducibile=false per
-- l'intero importo 2024 in via prudenziale (non e' chiaro se i 22,76€
-- residui siano deducibili senza il commercialista) — vedi ROADMAP. Per il
-- 2025 non esiste ancora il Prospetto annuale (solo l'estratto conto, che non
-- riporta questo dato): deducibile=true assunto in assenza di informazioni
-- contrarie, da confermare quando arriva il Prospetto 2025.

insert into public.fondi_pensione (user_id, intestatario_id, nome, tipo, is_estero, provider, note)
values (
  '1af33662-2dea-49b0-b7d6-ffe2bba781f5',
  '37af7f90-79d8-42e6-b172-367ccbd38846',
  'Fondo Pensione Generali (F.P.G.G.)',
  'fondo_chiuso_negoziale',
  false,
  'F.P.G.G. — Fondo Pensione dei Dipendenti delle società del Gruppo Generali',
  'Fondo preesistente italiano (Albo COVIP sez. Fondi Pensione Preesistenti n° 1109), adesione collettiva 22.11.2023. Posizione interamente in Gestione Separata GESAV.'
);

-- 2023
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2023-12-31'::date, 2023, 37.69, 'volontario', true,
  'Contributo lavoratore 2023 (prima annualità, iscrizione 22.11.2023). Nessun importo dichiarato come non dedotto nel prospetto 2023.');
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2023-12-31'::date, 2023, 286.48, 'contributo_datore_lavoro', false,
  'Contributo datore di lavoro 2023 (non deducibile per il lavoratore).');
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2023-12-31'::date, 2023, 1027.67, 'tfr', false,
  'TFR conferito 2023 (non rientra nel plafond deduzione RP).');

-- 2024
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2024-12-31'::date, 2024, 349.64, 'volontario', false,
  'Contributo lavoratore 2024 aggregato (12 versamenti mensili). Il prospetto dichiara 326,88€ su 349,64€ come "contributi versati e non dedotti" — deducibile=false sull''intero importo in via prudenziale finché non si chiarisce col commercialista il trattamento dei 22,76€ residui.');
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2024-12-31'::date, 2024, 2657.00, 'contributo_datore_lavoro', false,
  'Contributo datore di lavoro 2024 aggregato (12 mesi).');
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2024-12-31'::date, 2024, 4553.26, 'tfr', false,
  'TFR conferito 2024 aggregato (12 mesi).');

-- 2025 (da estratto conto, non da prospetto annuale — non ancora disponibile)
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2025-12-31'::date, 2025, 375.60, 'volontario', true,
  'Contributo lavoratore 2025 aggregato da estratto conto (12 mesi) — nessun dato su "non dedotto" disponibile in questo tipo di documento: da confermare col Prospetto annuale 2025 quando disponibile.');
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2025-12-31'::date, 2025, 3702.41, 'contributo_datore_lavoro', false,
  'Contributo datore di lavoro 2025 aggregato (12 mesi, include un versamento anomalo a luglio di 1.090,82€ — verosimilmente premio di risultato convertito).');
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2025-12-31'::date, 2025, 5131.10, 'tfr', false,
  'TFR conferito 2025 aggregato (12 mesi, include importi più alti ad aprile 824,74€ e dicembre 730,10€ — verosimilmente tredicesima/quattordicesima).');

insert into public.fondo_pensione_posizione (user_id, fondo_id, data_valorizzazione, controvalore_eur, rendimento_periodo_pct, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2023-12-31'::date, 1352.07, null,
  'Da Prospetto 2023. Rendimento netto 2023: 0,23€ (gestione GESAV, rendimento netto medio annuo 2,37%).');
insert into public.fondo_pensione_posizione (user_id, fondo_id, data_valorizzazione, controvalore_eur, rendimento_periodo_pct, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2024-12-31'::date, 9024.98, null,
  'Da Prospetto 2024. Rendimento netto 2024: 113,01€ (gestione GESAV, rendimento netto medio annuo 2,41%). Proiezione COVIP a pensionamento (01.02.2061, se prosegue con questo ritmo): posizione finale stimata 733.513,35€, rendita annua stimata 33.017,94€ lorda — proiezione, non un valore garantito.');
insert into public.fondo_pensione_posizione (user_id, fondo_id, data_valorizzazione, controvalore_eur, rendimento_periodo_pct, note)
values ('1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, (select id from public.fondi_pensione where nome = 'Fondo Pensione Generali (F.P.G.G.)'), '2025-12-31'::date, 18234.09, null,
  'Da Estratto conto al 31.12.2025. Nessun rendimento separato in questo documento (il saldo coincide esattamente con posizione precedente + contributi dell''anno): serve il Prospetto annuale 2025 per il dato di rendimento.');

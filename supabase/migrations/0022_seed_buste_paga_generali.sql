-- Primo caricamento reale per Fase 3 (INTROITI): 9 buste paga (Generali, datore di
-- lavoro di Mattia Madaschi), estratte a mano dai PDF caricati su Drive
-- (BUDGETING/03_INTROITI/BUSTE_PAGA/), ottobre 2025 -> giugno 2026.
--
-- Formato busta paga molto compresso (tabella multi-colonna appiattita in testo
-- lineare dall'estrazione PDF, tipico di sistemi payroll aziendali tipo
-- Zucchetti/ADP): estratti con sicurezza periodo, data pagamento, netto (pattern
-- riconoscibile: ultimo importo prima di "BANCA GENERALI... IBAN", seguito dalla
-- data) e alcune trattenute chiaramente etichettate (addizionali regionale/comunale,
-- contributo previdenza integrativa, contributo solidarietà, trattenuta buono
-- pasto). IRPEF e contributi INPS non sono isolabili con sicurezza dal testo (righe
-- "Reg. Imponibile Fiscale" cumulative non decodificate) — lasciati NULL invece di
-- essere fabbricati, come da nota su ogni riga.
--
-- Caso particolare dicembre 2025: il cedolino include la tredicesima mensilità
-- (5.283,48€), anticipata il 19/12/2025 con un documento a parte (netto 4.437,61€,
-- "13.ma mensilita'.pdf") e poi conguagliata nel cedolino di fine mese — il netto
-- qui riportato (7.133,79€) e' gia' il totale dopo aver dedotto l'anticipo. La riga
-- del documento di anticipo NON viene inserita separatamente per evitare un doppio
-- conteggio (stessa logica gia' vista per il conguaglio condominiale in Fase 2).
--
-- Altri documenti caricati in Drive ma non ancora usati: 3 Certificazioni Uniche
-- (2023/2024/2025 — riepiloghi annuali, formato diverso dalla busta paga mensile,
-- utili in futuro per una riconciliazione annuale) e 3 documenti contrattuali
-- (lettera di assunzione, C.I.A./accordo aziendale, bonus e promozione) — puramente
-- di riferimento, non periodici, non modellati in introiti_buste_paga.

insert into public.introiti_buste_paga
  (user_id, intestatario_id, datore_lavoro, periodo_da, periodo_a, data_pagamento, lordo, netto, addizionali_regionali_comunali, altre_trattenute, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5', i.id, v.datore_lavoro,
       v.periodo_da::date, v.periodo_a::date, v.data_pagamento::date,
       v.lordo::numeric, v.netto::numeric, v.addizionali::numeric, v.altre_trattenute::numeric, v.note
from public.intestatari i
cross join (values
  ('Generali','2025-10-01','2025-10-31','2025-10-27','5286.40','4392.32','37.83','203.47','Retribuzione lorda mensile base, nessuna voce variabile. IRPEF/INPS non isolabili con sicurezza dal testo estratto (formato busta paga molto compresso, righe "Reg. Imponibile Fiscale" cumulative non decodificate) — lasciati null, non fabbricati.'),
  ('Generali','2025-11-01','2025-11-30','2025-11-27','5286.40','4392.32','33.34','161.47','Retribuzione lorda mensile base, nessuna voce variabile. IRPEF/INPS lasciati null (vedi nota ottobre).'),
  ('Generali','2025-12-01','2025-12-31','2025-12-24','10569.88','7133.79',null,'158.01','Lordo = retribuzione base 5.286,40€ + 13ma mensilità 5.283,48€ (13esima anticipata il 19/12/2025 con netto 4.437,61€ tramite documento separato "13.ma mensilita.pdf", poi rendicontata e netizzata nel cedolino di fine mese: il netto qui riportato, 7.133,79€, è già il totale conguagliato dopo aver dedotto l''anticipo — NON sommare i due documenti, sarebbe un doppio conteggio). Addizionali regionali/comunali non presenti come voci separate in questo cedolino.'),
  ('Generali','2026-01-01','2026-01-31','2026-01-27','5286.40','4396.30','34.46','147.47','Retribuzione lorda mensile base, nessuna voce variabile. IRPEF/INPS lasciati null (vedi nota ottobre).'),
  ('Generali','2026-02-01','2026-02-28','2026-02-27','5286.40','4396.29','34.46','168.47','Retribuzione lorda mensile base, nessuna voce variabile. IRPEF/INPS lasciati null (vedi nota ottobre).'),
  ('Generali','2026-03-01','2026-03-31','2026-03-27','5325.19','4432.28','34.46','147.81','Retribuzione tabellare aumentata a 3.965,48€/mese (RLM 5.325,19€) dal cedolino di marzo. Presente anche "Una Tantum in Welfare" 300€, escluso dal lordo (fringe benefit welfare, non retribuzione monetaria imponibile ordinaria). IRPEF/INPS lasciati null (vedi nota ottobre).'),
  ('Generali','2026-04-01','2026-04-30','2026-04-27','15085.19','12503.51','34.46','126.35','Lordo = RLM 5.325,19€ + retribuzione variabile (STI) 9.350,00€ + indennità forfettaria 410,00€. IRPEF/INPS lasciati null (vedi nota ottobre).'),
  ('Generali','2026-05-01','2026-05-31','2026-05-27','5325.19','4663.88','34.47','154.81','Retribuzione lorda mensile base, nessuna voce variabile (rimborsi spese/welfare esclusi dal lordo). IRPEF/INPS lasciati null (vedi nota ottobre).'),
  ('Generali','2026-06-01','2026-06-30','2026-06-26','8268.19','7237.55','34.45','170.78','Lordo = RLM 5.325,19€ + Premio Aziendale Variabile 2.943,00€ (tassato con imposta sostitutiva anziché IRPEF ordinaria, regime detassazione premi di produttività). IRPEF/INPS lasciati null (vedi nota ottobre).')
) as v(datore_lavoro, periodo_da, periodo_a, data_pagamento, lordo, netto, addizionali, altre_trattenute, note)
where i.codice_fiscale = 'MDSMTT94A12A246E';

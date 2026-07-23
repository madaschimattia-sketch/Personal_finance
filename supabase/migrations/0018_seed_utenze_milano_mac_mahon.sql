-- Primo caricamento reale per Fase 2 (UTENZE): domicilio "Milano - Mac Mahon" (contratto
-- di locazione TOMBINI/MADASCHI, locatore ORTEGA Giuseppina), estratto a mano dai
-- documenti caricati su Drive (BUDGETING/02_UTENZE/MILANO - MAC MAHON/) in questa sessione.
--
-- Nota sull'archiviazione: questi documenti sorgente (10 bollette A2A luce, 14 conti
-- telefonici Vodafone, 1 contratto di locazione, 2 consuntivi condominiali) sono
-- attualmente su Drive ma NON ancora copiati su Supabase Storage / documenti_grezzi
-- (nessun JWT utente disponibile in sessione per l'upload, stesso limite del backfill
-- IBKR di Fase 1 — vedi ROADMAP.md "Debito di archiviazione"). L'estrazione qui è stata
-- fatta a mano leggendo il contenuto testuale dei PDF via Drive, NON tramite la edge
-- function estrai-bolletta (Claude API) — quella resta quindi non ancora validata contro
-- dati reali, in attesa del secret ANTHROPIC_API_KEY.
--
-- Riga AFFITTO: rappresenta i TERMINI CONTRATTUALI (rata trimestrale), non prova di
-- pagamento del singolo trimestre — nessun estratto conto caricato per verificarlo.
-- Righe CONDOMINIO: la seconda (consuntivo 2023/2024) riporta solo il saldo finale
-- personale di fine esercizio, perché il dettaglio per voce nella tabella originale
-- risultava poco leggibile dopo l'estrazione testo del PDF (vedi nota sulla riga).

insert into public.intestatari (user_id, nome, cognome, codice_fiscale, relazione)
values
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'Mattia', 'Madaschi', 'MDSMTT94A12A246E', 'io'),
  ('1af33662-2dea-49b0-b7d6-ffe2bba781f5', 'Martina', 'Tombini', 'TMBMTN94M47A246X', 'convivente');

insert into public.domicili (user_id, nome, indirizzo, note)
values (
  '1af33662-2dea-49b0-b7d6-ffe2bba781f5',
  'Milano - Mac Mahon',
  'Via Mac Mahon 1, 20155 Milano MI',
  'Locazione (contratto TOMBINI/MADASCHI, locatore ORTEGA Giuseppina), decorrenza 19/01/2024-18/01/2028, cedolare secca. Cartella Drive: BUDGETING/02_UTENZE/MILANO - MAC MAHON.'
);

insert into public.domicilio_intestatari (user_id, domicilio_id, intestatario_id, quota_percentuale)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5', d.id, i.id, 50.0
from public.domicili d, public.intestatari i
where d.nome = 'Milano - Mac Mahon'
  and i.codice_fiscale in ('MDSMTT94A12A246E', 'TMBMTN94M47A246X');

insert into public.utenze_bollette
  (user_id, domicilio_id, categoria, fornitore, numero_fattura, data_emissione, data_scadenza, periodo_da, periodo_a, importo, consumo, unita_misura, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5', d.id, v.categoria, v.fornitore, v.numero_fattura,
       v.data_emissione::date, v.data_scadenza::date, v.periodo_da::date, v.periodo_a::date,
       v.importo::numeric, v.consumo::numeric, v.unita_misura, v.note
from public.domicili d
cross join (values
  -- LUCE (A2A Energia)
  ('luce','A2A Energia','525501415240','2025-01-29','2025-02-18','2024-12-10','2024-12-31','39.00',null,null,null),
  ('luce','A2A Energia','525504434509','2025-03-27','2025-04-16','2025-01-01','2025-02-28','213.00','484','kWh',null),
  ('luce','A2A Energia','525507477503','2025-05-23','2025-06-12','2025-03-01','2025-04-30','153.00','341','kWh',null),
  ('luce','A2A Energia','525510487402','2025-07-23','2025-08-12','2025-05-01','2025-06-30','158.00','380','kWh',null),
  ('luce','A2A Energia','525513434633','2025-09-22','2025-10-13','2025-07-01','2025-08-31','118.00','199','kWh',null),
  ('luce','A2A Energia','525516394270','2025-11-19','2025-12-09','2025-09-01','2025-10-31','159.00','407','kWh',null),
  ('luce','A2A Energia','526500996206','2026-01-20','2026-02-09','2025-11-01','2025-12-31','150.00','356','kWh','Include 9,00€ canone abbonamento TV'),
  ('luce','A2A Energia','526504071172','2026-03-18','2026-04-07','2026-01-01','2026-02-28','187.00','428','kWh','Include 18,00€ canone TV + 3,58€ spese sollecito'),
  ('luce','A2A Energia','526506910140','2026-05-18','2026-06-08','2026-03-01','2026-04-30','194.00','474','kWh','Include 18,00€ canone TV'),
  ('luce','A2A Energia','526509999622','2026-07-20','2026-08-10','2026-05-01','2026-06-30','168.00','390','kWh','Include 18,00€ canone TV + 0,61€ interessi di mora'),
  -- INTERNET (Vodafone, linea fissa) — manca il periodo 09/01-08/02/2025 (bolletta non caricata)
  ('internet_telefono','Vodafone','TF50876760','2024-09-14','2024-10-04','2024-09-09','2024-10-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF52651830','2024-10-15','2024-11-04','2024-10-09','2024-11-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF54768755','2024-11-15','2024-12-05','2024-11-09','2024-12-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF57419316','2024-12-14','2025-01-03','2024-12-09','2025-01-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF63636530','2025-02-14','2025-03-06','2025-02-09','2025-03-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF66353856','2025-03-14','2025-04-03','2025-03-09','2025-04-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF69110995','2025-04-16','2025-05-06','2025-04-09','2025-05-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF71846839','2025-05-16','2025-06-05','2025-05-09','2025-06-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF74563185','2025-06-14','2025-07-04','2025-06-09','2025-07-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF77281337','2025-07-13','2025-08-02','2025-07-09','2025-08-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF79995997','2025-08-15','2025-09-04','2025-08-09','2025-09-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF82681996','2025-09-14','2025-10-04','2025-09-09','2025-10-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF85385441','2025-10-15','2025-11-04','2025-10-09','2025-11-08','24.90',null,null,null),
  ('internet_telefono','Vodafone','TF88076663','2025-11-14','2025-12-04','2025-11-09','2025-12-08','24.90',null,null,null),
  -- AFFITTO (contratto di locazione, non prova di pagamento per singolo trimestre)
  ('affitto','ORTEGA Giuseppina (locatore)',null,'2024-01-19',null,'2024-01-19','2028-01-18','5340.00',null,null,'Rata trimestrale anticipata da contratto (canone 4.500€/trim + anticipo spese condominiali 840€/trim = 5.340€/trim, canone annuo 18.000€ + anticipo condominiale 3.360€ = 21.360€/anno). Scadenze rate: 19/01-19/04-19/07-19/10. Regime cedolare secca. Conduttori: Mattia Madaschi + Martina Tombini (obbligazione in solido). Riga di riferimento contrattuale, NON prova di pagamento del singolo trimestre.'),
  -- CONDOMINIO (Studio Delta, amministrazione)
  ('condominio','Studio Delta (amministrazione condominio)',null,'2025-04-15',null,'2024-10-15','2025-04-15','225.49',null,null,'Conteggio individuale spese riscaldamento stagione 2024/2025 (quota fissa 197,89€ + quota consumo 27,60€), unità 18P5A. Da confrontare con l''anticipo condominiale versato via canone affitto (840€/trimestre).'),
  ('condominio','Studio Delta (amministrazione condominio)',null,'2024-11-19',null,'2023-10-01','2024-09-30','28.29',null,null,'Consuntivo condominiale esercizio 2023/2024 (bozza), unità SX33 (Ortega B. - Lauricella). Importo = saldo finale personale di fine esercizio dalla tabella "Totale gestione/Saldi di fine" — le altre colonne del consuntivo (ripartizione per voce: generali/acqua/ascensore/riscaldamento) risultavano poco leggibili dall''estrazione testo del PDF e andrebbero riverificate a mano sul documento originale se serve il dettaglio per voce, non solo il saldo.')
) as v(categoria, fornitore, numero_fattura, data_emissione, data_scadenza, periodo_da, periodo_a, importo, consumo, unita_misura, note)
where d.nome = 'Milano - Mac Mahon';

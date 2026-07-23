-- Correzioni al primo caricamento di migration 0018, dopo che l'utente ha aggiunto
-- documenti mancanti su Drive e sostituito un documento condominiale errato:
--   1) 2 bollette luce 2024 (colmano gennaio-aprile 2024, mancavano)
--   2) 1 conto telefonico Vodafone di gennaio 2025 (colmava un buco gia'' segnalato)
--   3) Il documento "Letture Risc. 24.25 ORTEGA.pdf" (solo riscaldamento, 225,49€) era
--      sbagliato/incompleto — l'utente lo ha sostituito con il rendiconto completo
--      "Rend. 24.25 + Prev. 25.26.pdf" (Studio Delta SAS), che copre l'intero esercizio
--      condominiale 2024/2025 per l'unità SX33. Qui si elimina la riga basata sul
--      documento vecchio e si inserisce quella dal documento corretto.
--
-- Nota: la ripartizione voci "a carico inquilino" vs "a carico proprietà" per il
-- consuntivo condominiale NON è stata modellata riga-per-riga: la tabella del PDF
-- (colonne Condominio/Proprietà/Mediazione TRIPODI/Generali/Acqua/Ascensore/
-- Antenna TV/Riscaldamento) risulta poco affidabile dopo l'estrazione testo (colonne
-- disallineate dall'OCR) — si riporta solo il saldo finale personale dell'esercizio,
-- che è l'unico numero verificabile con sicurezza. Vedi nota sulla riga.

delete from public.utenze_bollette
where categoria = 'condominio'
  and periodo_da = '2024-10-15' and periodo_a = '2025-04-15' and importo = 225.49;

insert into public.utenze_bollette
  (user_id, domicilio_id, categoria, fornitore, numero_fattura, data_emissione, data_scadenza, periodo_da, periodo_a, importo, consumo, unita_misura, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5', d.id, v.categoria, v.fornitore, v.numero_fattura,
       v.data_emissione::date, v.data_scadenza::date, v.periodo_da::date, v.periodo_a::date,
       v.importo::numeric, v.consumo::numeric, v.unita_misura, v.note
from public.domicili d
cross join (values
  ('condominio','Studio Delta SAS (amministrazione condominio)',null,'2025-09-30',null,'2024-10-01','2025-09-30','528.37',null,null,'Consuntivo condominiale esercizio 2024/2025, unità SX33 (Ortega B. - Lauricella). Importo = saldo finale personale di fine esercizio dalla tabella "Totale gestione/Saldi di fine". Il documento contiene anche la ripartizione per voce (Condominio/Proprietà/Mediazione TRIPODI/Generali/Acqua/Ascensore/Antenna TV/Riscaldamento) ma la tabella e'' risultata poco affidabile dall''estrazione testo del PDF (colonne disallineate, cifre ambigue) — NON riportata qui per non fabbricare precisione che non ho. Per la suddivisione voci a carico inquilino vs proprietà serve rileggere il documento originale (criteri di legge art. 9 L.392/1978).'),
  ('luce','A2A Energia','524503648603','2024-03-29','2024-04-18','2024-02-02','2024-02-29','84.20','139','kWh','Include 14,62€ canone TV (dal 02.2024 al 03.2024)'),
  ('luce','A2A Energia','524506209966','2024-05-24','2024-06-13','2024-03-01','2024-04-30','121.60','345','kWh','Include 14,62€ canone TV (2 mensilità 7,31€)'),
  ('internet_telefono','Vodafone','TF60845767','2025-01-15','2025-02-04','2025-01-09','2025-02-08','24.90',null,null,null)
) as v(categoria, fornitore, numero_fattura, data_emissione, data_scadenza, periodo_da, periodo_a, importo, consumo, unita_misura, note)
where d.nome = 'Milano - Mac Mahon';

-- Primo fondo pensione popolato da documenti reali (cartella Drive
-- BUDGETING/05_FONDO_PENSIONE/2022_Axa_Luxembourg): "Save for Life Pension",
-- polizza AXA Assurances Vie Luxembourg (contratto 428001274), intestata a
-- Mattia. E' un prodotto assicurativo-previdenziale lussemburghese, non un
-- fondo pensione italiano armonizzato (fondo aperto/PIP/negoziale) — tipo
-- 'estero', is_estero=true (rilevante anche per il monitoraggio RW, da
-- verificare in Fase Verifica).
--
-- Coperti 2 documenti ("Situation SFLP 2022", as-of 01/01/2023; "Situation
-- SFLP 2024", as-of 01/01/2025). Manca il documento 2023 (as-of 01/01/2024):
-- nessun versamento/posizione inserito per quell'anno, gap reale segnalato
-- dall'utente, non un'assunzione.
--
-- Versamenti 2022: importo_eur = quota LORDA pagata (quella uscita dal conto
-- dell'utente), non netta — la differenza lordo/netto (1.600 vs 1.536 per
-- versamento, ~4%) è il caricamento AXA sul premio, annotato in nota.
-- Nessun versamento 2023 (mancante) né 2024 (il documento 2024 dichiara
-- esplicitamente "Savings made in 2024: 0,00€").
--
-- deducibile=false per entrambi i versamenti: la deducibilità RP di un
-- prodotto assicurativo-pensionistico lussemburghese non è automatica come
-- per un fondo pensione italiano armonizzato — resta da verificare con il
-- commercialista (vedi ROADMAP Fase Verifica), default prudenziale a false
-- nel frattempo (calcola-fondo-pensione quindi non la conta nella deduzione
-- RP finché non confermata).

with nuovo_fondo as (
  insert into public.fondi_pensione (user_id, intestatario_id, nome, tipo, is_estero, provider, note)
  values (
    '1af33662-2dea-49b0-b7d6-ffe2bba781f5',
    '37af7f90-79d8-42e6-b172-367ccbd38846',
    'AXA Save for Life Pension',
    'estero',
    true,
    'AXA Assurances Vie Luxembourg S.A.',
    'Polizza assicurativo-previdenziale lussemburghese, contratto 428001274. Deducibilità RP e monitoraggio RW da verificare col commercialista (vedi ROADMAP).'
  )
  returning id
)
insert into public.fondo_pensione_versamenti (user_id, fondo_id, data, anno_competenza, importo_eur, tipo_versamento, deducibile, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, id, '2022-12-01'::date, 2022, 1600.00, 'volontario', false,
  'AXA Pension Euro Protection du capital — importo lordo pagato; netto investito 1.536,00€ (caricamento AXA 64,00€). Deducibilità RP non confermata.'
from nuovo_fondo
union all
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, id, '2022-12-02'::date, 2022, 1600.00, 'volontario', false,
  'AXA Pension Long Terme R — importo lordo pagato; netto investito 1.536,00€ (caricamento AXA 64,00€). Deducibilità RP non confermata.'
from nuovo_fondo;

insert into public.fondo_pensione_posizione (user_id, fondo_id, data_valorizzazione, controvalore_eur, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, id, '2023-01-01'::date, 3003.65,
  'Da "Situation SFLP 2022": Fondo Euro Protection 1.537,13€ + Fondo Long Terme R 1.466,52€ (11,01404 quote a 133,15€, valorizzate al 30/12/2022).'
from (select id from public.fondi_pensione where nome = 'AXA Save for Life Pension') f
union all
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5'::uuid, id, '2025-01-01'::date, 6703.98,
  'Da "Situation SFLP 2024": Fondo Euro 3.184,02€ + Fondo Long Terme (21,517 quote a 163,59€) 3.519,96€. Nessun versamento nel 2023 (documento mancante) né nel 2024 (dichiarato 0,00€ nel documento). Performance storiche dal documento: AXA Pension Euro 2,10%/2,00%/1,00% (2024/2023/2022 netto); AXA Pension Long Terme (ISIN FR0010933721) 10,38%/11,31%/-16,77% (2024/2023/2022).'
from (select id from public.fondi_pensione where nome = 'AXA Save for Life Pension') f;

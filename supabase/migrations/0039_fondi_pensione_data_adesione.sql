-- Serve per prorare l'IVAFE (quadro RW) sull'anno di adesione: senza questa
-- data non si può calcolare la frazione dell'anno in cui il fondo estero era
-- posseduto (art. 19 comma 18 D.L. 201/2011, stesso principio già applicato
-- ai conti in _shared/quadro-rw.ts).
alter table public.fondi_pensione add column data_adesione date;

comment on column public.fondi_pensione.data_adesione is
  'Data di adesione/apertura del fondo — usata per prorare l''IVAFE (quadro RW) nell''anno di adesione. Null = data sconosciuta, RW calcolato su anno intero.';

update public.fondi_pensione set data_adesione = '2022-12-01'
  where nome = 'AXA Save for Life Pension'; -- primo versamento noto (Versamento Initial 01/12/2022)
update public.fondi_pensione set data_adesione = '2023-11-22'
  where nome = 'Fondo Pensione Generali (F.P.G.G.)'; -- "Data d'adesione al Fondo" esplicita nei prospetti

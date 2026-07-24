-- Correzione al motore di sostenibilità (Fase 4): la prima simulazione ha rivelato
-- un doppio conteggio tra affitto e condominio (l'utente ha confermato che per questo
-- domicilio la quota condominiale è già pagata dentro la rata trimestrale di affitto,
-- 840€/trim inclusi nei 5.340€/trim — la riga condominio è il conguaglio riconciliato,
-- non un secondo pagamento cash). Portando la frequenza a 'una_tantum' si riusa la
-- logica di esclusione già presente in _shared/budget-sostenibilita.ts (righe con
-- frequenza non mappata a un numero di mesi vengono escluse dal calcolo dei costi
-- fissi ricorrenti), senza bisogno di nuovo codice.
update public.utenze_bollette set frequenza = 'una_tantum'
where categoria = 'condominio';

comment on column public.utenze_bollette.frequenza is 'Periodicità di fatturazione — usata dal motore budget per il costo mensile equivalente. ''una_tantum'' viene escluso dal calcolo dei costi fissi RICORRENTI: per questo domicilio, condominio è escluso perché la quota condominiale è già pagata come parte della rata trimestrale di affitto (840€/trim, dentro l''importo della riga affitto) — la riga condominio qui rappresenta la riconciliazione/conguaglio (quanto realmente dovuto vs anticipato), non un secondo pagamento cash, quindi va integrata solo ex-post quando confermata, non nel calcolo ricorrente.';

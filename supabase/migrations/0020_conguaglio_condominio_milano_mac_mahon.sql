-- Sostituisce le 2 righe condominio basate sul "saldo finale personale" (letto a
-- mano, con incertezza, dal consuntivo amministratore) con la riconciliazione
-- autorevole fatta dall'utente e approvata dalla proprietaria: "Prospetto conguaglio
-- (da inviare).xlsx", caricato su Drive in BUDGETING/02_UTENZE/MILANO - MAC MAHON/
-- CONDOMINIO/. Risolve il limite noto della migration 0019 (tabella del PDF
-- amministratore poco affidabile per la ripartizione voce-per-voce inquilino/
-- proprietà) con una fonte già riconciliata e concordata con il locatore.
--
-- Il prospetto separa esplicitamente:
--   - Totale gestione appartamento (unità SX33, dal consuntivo amministratore)
--   - Quota Proprietà (spese di natura straordinaria, escluse dal conguaglio conduttore)
--   - Quota a carico conduttore = differenza delle prime due
--   - Acconti versati (le rate da 840€/trimestre incluse nel canone di affitto)
--   - Conguaglio a favore del conduttore = acconti - quota a carico conduttore
--
-- importo = quota a carico conduttore (il vero costo condominiale annuo del
-- conduttore, comparabile con le altre categorie di spesa in utenze_bollette).
-- Il dettaglio acconti/conguaglio resta in nota (non c'e' una colonna dedicata).

delete from public.utenze_bollette
where categoria = 'condominio'
  and periodo_da in ('2023-10-01', '2024-10-01')
  and importo in (28.29, 528.37);

insert into public.utenze_bollette
  (user_id, domicilio_id, categoria, fornitore, numero_fattura, data_emissione, data_scadenza, periodo_da, periodo_a, importo, consumo, unita_misura, note)
select '1af33662-2dea-49b0-b7d6-ffe2bba781f5', d.id, v.categoria, v.fornitore, v.numero_fattura,
       v.data_emissione::date, v.data_scadenza::date, v.periodo_da::date, v.periodo_a::date,
       v.importo::numeric, v.consumo::numeric, v.unita_misura, v.note
from public.domicili d
cross join (values
  ('condominio','Studio Delta SAS (amministrazione) — riconciliazione utente approvata da locatore',null,'2024-09-30',null,'2024-01-19','2024-09-30','1238.56',null,null,
   'Quota condominiale A CARICO CONDUTTORE, esercizio 2023/24, pro-rata 256/366gg dal 19/01/2024 (inizio locazione). Fonte: "Prospetto conguaglio (da inviare).xlsx", riconciliazione fatta dal conduttore e approvata dalla proprietaria. Totale gestione appartamento (unità SX33) 2.126,71€ meno quota Proprietà 355,96€ (spese straordinarie, escluse) = 1.770,75€/anno intero, pro-rata 1.238,56€. Acconti versati nel periodo (3 rate da 840€ incluse nel canone affitto) = 2.520,00€ → conguaglio a favore del conduttore 1.281,44€ (non ancora restituito/compensato). Dettaglio voci (da consuntivo amministratore, riga SX33, anno intero prima del pro-rata): quota Proprietà 355,96€ (esclusa), mediazione/spese legali 87,54€, generali (portierato/pulizia/energia/manut.ordinaria) 932,31€, acqua 68,75€, ascensore 117,23€, riscaldamento impianto 0,00€, riscaldamento consumo ripartito 394,98€, riscaldamento extra 97,24€, movimenti personali unità 72,70€.'),
  ('condominio','Studio Delta SAS (amministrazione) — riconciliazione utente approvata da locatore',null,'2025-09-30',null,'2024-10-01','2025-09-30','1712.73',null,null,
   'Quota condominiale A CARICO CONDUTTORE, esercizio 2024/25 (anno intero). Fonte: "Prospetto conguaglio (da inviare).xlsx", riconciliazione fatta dal conduttore e approvata dalla proprietaria. Totale gestione appartamento (unità SX33) 2.068,69€ meno quota Proprietà 355,96€ (spese straordinarie, escluse) = 1.712,73€. Acconti versati nel periodo (4 rate da 840€ incluse nel canone affitto) = 3.360,00€ → conguaglio a favore del conduttore 1.647,27€ (non ancora restituito/compensato). Conguaglio complessivo cumulato su entrambi gli esercizi (2023/24+2024/25): 2.928,71€ a favore del conduttore.')
) as v(categoria, fornitore, numero_fattura, data_emissione, data_scadenza, periodo_da, periodo_a, importo, consumo, unita_misura, note)
where d.nome = 'Milano - Mac Mahon';

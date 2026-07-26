-- Il canone RAI e' addebitato dentro la bolletta luce (A2A), fino ad ora solo
-- come testo libero in note ("Include 14,62€ canone TV..."). Per poterlo
-- mostrare separato dal costo energia (grafico a barre raggruppate in
-- Spese ricorrenti > Casa) serve un valore proprio, non un parsing di note.
--
-- Nullable e senza CHECK: ha senso solo per categoria='luce', ma non lo
-- forziamo a livello di vincolo (coerente con lo stile delle altre colonne
-- opzionali di questa tabella, es. consumo/unita_misura). Backfill limitato
-- alle righe dove l'importo del canone e' esplicitamente scritto in note:
-- le altre bollette luce restano canone_rai_eur = null (sconosciuto, non
-- zero) — non inventiamo un valore che non e' nel documento originale.

alter table public.utenze_bollette add column canone_rai_eur numeric;

comment on column public.utenze_bollette.canone_rai_eur is
  'Quota di canone RAI/abbonamento TV inclusa nella bolletta luce, se nota (da note o da futura estrazione strutturata). Null = non itemizzato in questa bolletta, non zero.';

update public.utenze_bollette set canone_rai_eur = 14.62 where id = '537d8083-d9dc-444b-88c9-ba866557a1b6'; -- feb 2024, "Include 14,62€ canone TV (dal 02.2024 al 03.2024)"
update public.utenze_bollette set canone_rai_eur = 14.62 where id = 'b44aceca-26de-49cd-b340-cf04aa3d6ab9'; -- mar-apr 2024, "Include 14,62€ canone TV (2 mensilità 7,31€)"
update public.utenze_bollette set canone_rai_eur = 9.00  where id = 'bb14ef4c-ffc6-4e9d-9a04-7669eb5b3b30'; -- nov-dic 2025, "Include 9,00€ canone abbonamento TV"
update public.utenze_bollette set canone_rai_eur = 18.00 where id = '9af862a9-bfcc-41d8-b20e-389c5f8f3842'; -- gen-feb 2026, "Include 18,00€ canone TV + 3,58€ spese sollecito"
update public.utenze_bollette set canone_rai_eur = 18.00 where id = '27c60f6c-fe19-432a-a154-d693dfd8e23d'; -- mar-apr 2026, "Include 18,00€ canone TV"
update public.utenze_bollette set canone_rai_eur = 18.00 where id = '8301f0f4-c21c-4db6-8121-ef34b29d2f80'; -- mag-giu 2026, "Include 18,00€ canone TV + 0,61€ interessi di mora"

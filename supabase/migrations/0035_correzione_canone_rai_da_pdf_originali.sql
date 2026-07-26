-- Correzione: il backfill di canone_rai_eur in migration 0034 usava solo il testo
-- libero già presente in `note` (scritto a mano tempo fa, non sistematicamente).
-- L'utente ha giustamente fatto notare che alcune bollette luce potevano avere il
-- canone itemizzato nel PDF originale anche senza nota — leggendo i 15 PDF in
-- Drive (cartella UTENZE/MILANO - MAC MAHON/LUCE) risulta infatti che 9 delle 11
-- bollette lasciate a null in 0034 riportano il canone esplicitamente in fattura
-- ("Canone di abbonamento alla televisione per uso privato - MM.AAAA").
--
-- Un solo caso (10/12/2024-31/12/2024, bolletta 525501415240) e' stato letto e
-- confermato SENZA voce canone: qui il valore corretto e' 0 (verificato), non
-- null (mai controllato) — la bolletta di chiusura precedente aveva gia'
-- addebitato il canone 01.2025, quindi questo periodo ne e' legittimamente privo.
--
-- Con questa correzione tutte le 10 righe luce lasciate a null in 0034 sono
-- state verificate contro il PDF originale: nessuna riga resta sconosciuta.

update public.utenze_bollette set canone_rai_eur = 14.62 where id = 'bf5f24b8-7408-411d-9d01-418a1b74dcef'; -- mag-giu 2024, bolletta 524508910779: canone 06.2024+07.2024
update public.utenze_bollette set canone_rai_eur = 14.62 where id = 'd9aca3e8-4225-4c98-ad3e-0d2ff69f1b72'; -- lug-ago 2024, bolletta 524511751609: canone 08.2024+09.2024
update public.utenze_bollette set canone_rai_eur = 7.31  where id = '2ec9928a-dc06-4b3b-aee7-c977c795120d'; -- set-ott 2024, bolletta 524514734183: canone 10.2024 (una sola mensilita')
update public.utenze_bollette set canone_rai_eur = 9.00  where id = '5fcca739-8b30-4a61-b1a1-b128130e0660'; -- nov-dic 2024 (chiusura contratto), bolletta 525500024636: canone 01.2025
update public.utenze_bollette set canone_rai_eur = 0.00  where id = '35e745ef-64f7-44bd-929d-90716f329ccc'; -- 10-31 dic 2024, bolletta 525501415240: verificato, nessuna voce canone in fattura
update public.utenze_bollette set canone_rai_eur = 18.00 where id = '391cb9d8-8b3f-40c6-b943-a91660dc0cd9'; -- gen-feb 2025, bolletta 525504434509: canone 02.2025+03.2025
update public.utenze_bollette set canone_rai_eur = 18.00 where id = '122239ca-e135-4601-9aa8-1c0fc54b6a2c'; -- mar-apr 2025, bolletta 525507477503: canone 04.2025+05.2025
update public.utenze_bollette set canone_rai_eur = 18.00 where id = 'a5193cd9-4d4e-4b35-aa82-b4b57dc12076'; -- mag-giu 2025, bolletta 525510487402: canone 06.2025+07.2025
update public.utenze_bollette set canone_rai_eur = 18.00 where id = '7b6e5efc-20cc-48fc-806d-5b5662c436aa'; -- lug-ago 2025, bolletta 525513434633: canone 08.2025+09.2025
update public.utenze_bollette set canone_rai_eur = 9.00  where id = 'b2b64797-a893-47d4-baa7-7d98363bd790'; -- set-ott 2025, bolletta 525516394270: canone 10.2025 (una sola mensilita')

-- Le uniche 2 righe che restano canone_rai_eur = null (genuinamente sconosciuto,
-- nessun PDF disponibile in Drive per verificarle): nessuna riga aggiornata qui.

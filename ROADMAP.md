# ROADMAP — Personal Finance (Budgeting)

> Documento **vivo**: ordine dei lavori, stato delle fasi, backlog. Il contesto stabile
> (stack, principi architetturali, schema) sta nel `README.md` e in `docs/`.

## Fase 0 — Fondamenta ✅ completata

`intestatari`, `domicili`, `documenti_grezzi` (RLS `user_id`/`auth.uid()` dal primo momento).

## Fase 1 — INVESTIMENTI (IBKR) + motore fiscale — in corso

- [x] Schema `conti`, `conto_intestatari`, `movimenti` (migration `0001`)
- [x] `documenti_grezzi` esteso a multi-origine (drive | ibkr_flex | manuale)
- [x] Schema motore fiscale: `tax_instruments`, `tax_movements`, `tax_lots`,
      `tax_lot_closures`, `tax_events`, `tax_loss_carryforward`, `fx_rates_ecb`,
      `tax_paesi_whitelist`, `config_fiscale_parametri` (migration `0002`)
- [x] `conto_nav_giornaliero` + vista giacenza media cash (per IVAFE regime fisso)
- [x] Anagrafica fondi pensione (`fondi_pensione`, versamenti, posizione) — solo dati,
      **non** il motore di calcolo (vedi backlog sotto)
- [x] Bucket Storage `documenti-grezzi` (privato) + policy per `user_id` (migration `0003`)
- [x] Edge function `ibkr-flex-pull` — pull (SendRequest/GetStatement+retry), archiviazione
      grezzo, normalizzazione (`tax_instruments`, `movimenti`, `tax_movements`,
      `conto_nav_giornaliero`). Protetta da JWT utente, deployata (`ACTIVE`, v4).
      Supporta `flex_query_id_override` per pull ad-hoc (backfill con query diversa
      da quella configurata sul conto).
      **Non ancora invocata via HTTP** (nessun frontend/login ancora costruito in
      questo repo per ottenere un JWT utente) — il backfill storico è stato fatto
      con SQL diretto (vedi sotto), non attraverso la function stessa.
- [x] Conto `BUDGETING` (IBKR `U13283246`, `flex_query_id=1579055`, YTD per i pull
      ricorrenti) inserito. **Backfill storico completo dic-2023→dic-2025** da 3
      XML forniti manualmente (`BUDGETING_2023/2024/2025.xml`): 282 `movimenti`,
      210 `tax_movements`, 26 `tax_instruments`, 526 righe `conto_nav_giornaliero`.
      **Nota**: i 3 XML sorgente NON sono stati archiviati su Storage (nessun JWT
      disponibile per l'upload) — `documenti_grezzi` non ha righe per questo backfill,
      a differenza di quanto accadrà per i pull futuri via edge function. Da chiudere
      quando esiste un flusso di login: o si ri-esegue il pull via function (che
      archivia correttamente), o si caricano manualmente i 3 file via Storage UI.
- [x] Bug trovato e corretto durante il backfill: i `Trade` con `assetCategory='CASH'`
      (conversioni valutarie EUR/USD di servizio) venivano trattati come acquisto/
      vendita fiscale — ora esclusi da `tax_movements` (restano in `movimenti` come
      ledger). Fix applicato sia allo script di backfill sia alla edge function (v4).
- [ ] Motore di calcolo lotti: matching vendita→lotto (LIFO/media ponderata),
      popolamento `tax_lot_closures`/`tax_events` (passo successivo, separato dal pull).
      Nota: i dati per il 2024-2025 sono già in `tax_movements`, pronti da consumare.
- [ ] Riconciliazione: confronto lotti calcolati vs snapshot `OpenPosition` IBKR
      (validazione, non ancora modellata come tabella — vedi nota in
      `docs/ibkr-flex-query-spec.md`)
- [ ] Trasferimenti titoli (`transfer_titoli`): il costo di carico per lotti trasferiti
      IN non è ancora seminato nel motore lotti — nessuno nel backfill 2023-2025
      (solo `transfer_cassa` osservati), ma da gestire se ricorre in futuro.

### Backlog Fase 1 — motore di calcolo fondi pensione

> Da progettare **dopo** che il motore lotti IBKR è operativo: dominio fiscale
> adiacente ma a bassa priorità (dati manuali, non blocca l'ingestione IBKR).
>
> Copre: deduzione contributi (tetto 5.164,57 €/anno, per `anno_competenza` su
> `fondo_pensione_versamenti`), imposta sostitutiva sul rendimento (già trattenuta
> dal fondo — non ricalcolata lato nostro, salvo verifica), tassazione in uscita
> con aliquota decrescente 15%→9% in base agli anni di iscrizione, distinzione
> fondi italiani (no RW) vs esteri (`fondi_pensione.is_estero` → RW). Schema
> tabelle di calcolo non ancora definito.

## Fase 2 — UTENZE (ingestione Drive → PDF → Claude)

Non iniziata. Pipeline separata da IBKR: parsing PDF via Claude API, non Flex Web Service.

## Fase 3 — INTROITI DA LAVORO

Non iniziata. Stessa pipeline Drive/Claude di UTENZE.

## Fase 4 — BUDGET

Dipende da INVESTIMENTI + UTENZE + INTROITI. Non iniziata.

## Fase 5 — ESPERTO DI FINANZA

Dipende da BUDGET. Non iniziata.

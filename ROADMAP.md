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
      `conto_nav_giornaliero`). Protetta da JWT utente, deployata (`ACTIVE`).
      **Non ancora testata con un pull reale** — serve `IBKR_FLEX_TOKEN` (secret) e
      `conti.flex_query_id` valorizzato per almeno un conto prima del primo invocation.
- [ ] Motore di calcolo lotti: matching vendita→lotto (LIFO/media ponderata),
      popolamento `tax_lot_closures`/`tax_events` (passo successivo, separato dal pull)
- [ ] Riconciliazione: confronto lotti calcolati vs snapshot `OpenPosition` IBKR
      (validazione, non ancora modellata come tabella — vedi nota in
      `docs/ibkr-flex-query-spec.md`)

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

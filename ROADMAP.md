# ROADMAP — Personal Finance (Budgeting)

> Documento **vivo**: ordine dei lavori, stato delle fasi, backlog. Il contesto stabile
> (stack, principi architetturali, schema) sta nel `README.md` e in `docs/`.

## Fase 0 — Fondamenta ✅ completata

`intestatari`, `domicili`, `documenti_grezzi` (RLS `user_id`/`auth.uid()` dal primo momento).

## Debito di archiviazione — grezzi non ancora caricati su Storage

> Processo permanente, non solo per Fase 1: ogni volta che un file grezzo (XML IBKR,
> PDF utenze/introiti, ecc.) viene usato per popolare dati normalizzati **senza** essere
> prima caricato su Storage con la sua riga `documenti_grezzi` (es. perché manca un JWT
> utente per fare l'upload, o l'ingestione è stata fatta a mano fuori dal flusso normale),
> va aggiunto a questa lista. Si rimuove una riga solo quando il file è stato
> effettivamente caricato su Storage e la riga `documenti_grezzi` corrispondente esiste
> — così l'"archiviazione ordinata dei file di supporto" (principio in
> [`docs/archiviazione-file-supporto.md`](docs/archiviazione-file-supporto.md)) resta
> verificabile invece di andare persa in una nota sparsa.

| File locale | Sezione | Conto/contesto | Motivo mancata archiviazione | Path Storage previsto |
|---|---|---|---|---|
| `BUDGETING_2023.xml` | investimenti | conto `BUDGETING` (IBKR `U13283246`) | Nessun JWT utente disponibile in sessione per l'upload | `{user_id}/investimenti/ibkr/{conto_id}/2023/flex_backfill_2023.xml` |
| `BUDGETING_2024.xml` | investimenti | conto `BUDGETING` (IBKR `U13283246`) | Nessun JWT utente disponibile in sessione per l'upload | `{user_id}/investimenti/ibkr/{conto_id}/2024/flex_backfill_2024.xml` |
| `BUDGETING_2025.xml` | investimenti | conto `BUDGETING` (IBKR `U13283246`) | Nessun JWT utente disponibile in sessione per l'upload | `{user_id}/investimenti/ibkr/{conto_id}/2025/flex_backfill_2025.xml` |

> `user_id` = `1af33662-2dea-49b0-b7d6-ffe2bba781f5`, `conto_id` = `381ed8ac-3540-4ffc-a0a3-99f790ac7d29`.
> Chiudibile appena esiste un login funzionante: o si ri-esegue il pull via
> `ibkr-flex-pull` (che archivia da sola), o si caricano questi 3 file a mano su Storage
> e si inseriscono le righe `documenti_grezzi` corrispondenti (`origine='ibkr_flex'`,
> `origine_ref` = un identificativo a scelta tipo `backfill-2023`, `conto_id` valorizzato,
> `periodo_da`/`periodo_a` = inizio/fine anno).

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
      **I 3 XML sorgente non sono ancora archiviati su Storage** — vedi
      "Debito di archiviazione" sopra per il dettaglio e la procedura di chiusura.
- [x] Bug trovato e corretto durante il backfill: i `Trade` con `assetCategory='CASH'`
      (conversioni valutarie EUR/USD di servizio) venivano trattati come acquisto/
      vendita fiscale — ora esclusi da `tax_movements` (restano in `movimenti` come
      ledger). Fix applicato sia allo script di backfill sia alla edge function (v4).
- [x] `tax_instruments.sub_category` (migration `0005`) + `metodo_costo` derivato dal
      segnale oggettivo IBKR (`subCategory='ETF'` → media ponderata, resto → LIFO):
      19 ETF/ETC (incl. i tracker materie prime/cripto WBTC/SLVRP/COPAl — IBKR li
      classifica lui stesso come ETF), 4 azioni ordinarie, 1 ADR, 2 titoli di stato
      → LIFO. `ibkr-flex-pull` non sovrascrive più `metodo_costo` una volta che
      `classificazione_confermata=true` (protezione dalla revisione umana).
- [x] Motore di matching lotti (LIFO/media ponderata) — modulo condiviso
      `supabase/functions/_shared/lot-matching.ts` + edge function
      `calcola-lotti-fiscali` (JWT-protected, deployata `ACTIVE`, v2).
      Eseguito sui dati reali BUDGETING via script offline (nessun JWT per invocare
      via HTTP, stesso limite di `ibkr-flex-pull`): **96 lotti (62 aperti, 34 chiusi),
      46 chiusure, plus/minus netto 4.764,48 €, nessuna anomalia di matching**
      (ogni vendita ha trovato quantità sufficiente nei lotti aperti).
- [x] **Sicurezza anni già dichiarati** — `dichiarazioni_fiscali` (migration `0006`:
      2023/2024 `presentata` → immutabili, 2025 `in_preparazione`, 2026
      `non_iniziata`) pilota `calcola-lotti-fiscali`: id lotto riusati
      (chiave `acquisto_movement_id`) così le chiusure ricalcolate sono
      confrontabili 1:1 con quelle in DB via `(lot_id, vendita_movement_id)`; uno
      strumento con divergenze su un anno bloccato viene saltato integralmente
      (nessuna scrittura, riportato in `strumenti_saltati_per_divergenza`) — mai
      sovrascritto senza controllo umano. Validato offline: **29/29 chiusure
      2023-2024 coincidenti col ricalcolo, zero divergenze**. Dettagli in
      `docs/decisioni-fiscali.md`.
- [x] **Opzioni: collegamento al sottostante + esercizio/assegnazione vs scadenza**
      — `tax_instruments.underlying_conid/isin/symbol` (informativo, migration
      `0007`) + `tax_movements.evento_opzione` da `OptionEAE.transactionType`
      (`ibkr-flex-pull` v6, via `mapOptionEventiPerTradeId`). `expiration`
      (verificato su OKLO) resta chiusura standalone corretta; `exercise`/
      `assignment` (nessun caso reale ancora nei dati) vengono comunque chiusi
      standalone come fallback ma segnalati in `anomalie`
      (`esercizio_assegnazione_non_gestito`) — la redistribuzione del premio sul
      lotto del sottostante non è automatizzata finché non c'è un caso reale su
      cui validarla. Dettagli in `docs/decisioni-fiscali.md`.
- [x] `tax_paesi_whitelist` **popolata e verificata** (migration `0008`, 134 righe
      dal testo integrale del Decreto Min. Finanze 4/9/1996 consolidato al
      03/04/2017, `verificato=true`) — sostituisce il seed provvisorio FR/US.
      `tax_instruments` per l'OAT francese e il T-bond USA aggiornati a
      `is_titolo_stato_whitelist=true`, `classificazione_confermata=true` (nessun
      impatto retroattivo: zero chiusure esistenti su questi due strumenti finora,
      quindi `categoria_compensazione='whitelist'` si applicherà dalla prossima
      vendita). Dettagli e limiti (elenco non auto-aggiornante, art. 1-bis) in
      `docs/decisioni-fiscali.md`.
- [x] `tax_instruments.classificazione_confermata` **completata per tutti i 27
      strumenti** (migration `0010`): 10 non-OICR (azioni/ADR/BDC/opzione/ETC fisici
      su commodity — GOLD/WBTC/SLVRP/COPAl sono debt security/ETP, non fondi, pur
      con `subCategory='ETF'` in IBKR) + 15 OICR (fondi UCITS armonizzati) + 2
      titoli di stato whitelist (OAT/T-bond, già fatti in `0008`). Verificato via
      web search per i casi meno ovvi (WisdomTree Physical Bitcoin: "UCITS
      Eligible, non UCITS Compliant", forma legale Debt Security; Amundi Physical
      Gold: struttura ETC; Carlyle Secured Lending: BDC USA, non UCITS/UE),
      esteso per pattern agli altri fondi della stessa famiglia di emittenti.
      `tax_lot_closures.categoria_compensazione` ricalcolato per tutte le 46
      chiusure esistenti (join diretto su `tax_instruments`, nessun impatto su
      quantità/importi): **29 ordinaria (4.810,17 €), 17 oicr_non_compensabile
      (-45,69 €)**, nessuna whitelist (i 2 titoli di stato non hanno ancora
      vendite).
- [x] **Quadro RT** (redditi diversi di natura finanziaria, art. 67/68 TUIR) —
      modulo condiviso `supabase/functions/_shared/quadro-rt.ts` + edge function
      `calcola-quadro-rt` (JWT-protected per **utente**, non per conto: la
      dichiarazione è unica su tutti i broker). Compensazione solo entro la
      stessa `categoria_compensazione`; OICR sempre imponibile in pieno, minus
      OICR non riportabile (nessuna riga `tax_loss_carryforward` — coerente con
      lo schema, ma la reale compensabilità delle minus OICR "armonizzati" post
      D.Lgs 2011/2012 resta un punto aperto per il commercialista, vedi
      `docs/decisioni-fiscali.md`). Rifiuta di scrivere per anni con
      `dichiarazioni_fiscali.stato='presentata'`. Calcolato per il 2025 (via SQL
      diretto, stesso limite JWT delle altre function): **plusvalenza ordinaria
      imponibile 3.952,21 € (imposta 1.027,57 €), provento OICR imponibile
      31,34 € (imposta 8,15 €) — imposta totale RT 2025 stimata 1.035,72 €**,
      nessuna minusvalenza/riporto (tutte le chiusure 2025 sono plusvalenze).
      Seed `config_fiscale_parametri` per anno 2025 (migration `0009`, stessi
      valori del 2026, `verificato=false`).
- [ ] Quadro RM (dividendi/interessi/cedole, credito d'imposta estero) e quadro
      RW (monitoraggio estero + IVAFE) — non ancora implementati, prossimi passi
      naturali del quadro fiscale dopo RT.
- [ ] Riconciliazione: confronto lotti calcolati vs snapshot `OpenPosition` IBKR
      (validazione, non ancora modellata come tabella — vedi nota in
      `docs/ibkr-flex-query-spec.md`)
- [ ] Trasferimenti titoli (`transfer_titoli`): il costo di carico per lotti trasferiti
      IN non è ancora seminato nel motore lotti — nessuno nel backfill 2023-2025
      (solo `transfer_cassa` osservati), ma da gestire se ricorre in futuro.
- [ ] Opzioni senza ISIN: `ibkr-flex-pull` scarta le righe `SecuritiesInfo` senza ISIN
      (filtro `.filter(s => s.isin)`), quindi un pull normale **non crea**
      `tax_instruments` per le opzioni. Per il backfill l'unica opzione (OKLO call)
      è stata inserita a mano (`conid` come riferimento, `isin=NULL`). Se in futuro
      ricorrono più opzioni, va rivista la chiave di upsert (oggi solo su `isin`,
      andrebbe estesa a `conid` per evitare righe duplicate ad ogni pull).

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

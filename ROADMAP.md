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
- [x] **Quadro RM Sezione V** (redditi di capitale di fonte estera: dividendi,
      interessi, cedole — art. 44/45 TUIR) — modulo condiviso
      `supabase/functions/_shared/quadro-rm.ts` + edge function `calcola-quadro-rm`
      (JWT-protected per utente). A differenza di RT non c'è compensazione: ogni
      provento è imponibile per intero, ridotto solo dal credito d'imposta per le
      ritenute estere subite (`tax_movements.tipo='ritenuta'`), limitato al minore
      tra ritenuta e imposta italiana lorda sulla stessa categoria (eccedenza non
      utilizzata, segnalata per verifica commercialista — IBKR non è sostituto
      d'imposta italiano, quindi tutto va autoliquidato). Distinzione
      whitelist/ordinaria solo per le cedole di titoli di stato whitelist; OICR
      non ha trattamento speciale in RM (a differenza di RT). Stessa sicurezza
      anni già dichiarati di RT. Calcolato per il 2025 (via SQL diretto): reddito
      ordinario imponibile 817,75 € (imposta lorda 212,62 €, credito estero
      82,49 €, imposta netta 130,12 €), cedole whitelist imponibile 188,95 €
      (imposta 23,62 €, nessuna ritenuta) — **imposta totale RM 2025 stimata
      153,74 €**. Dettagli in `docs/decisioni-fiscali.md`.
- [x] **Quadro RW — IVAFE** (imposta, non il monitoraggio di dettaglio riga per riga)
      — modulo condiviso `supabase/functions/_shared/quadro-rw.ts` + edge function
      `calcola-quadro-rw` (JWT-protected, **per conto**, a differenza di RT/RM: ogni
      conto estero è l'unità naturale di monitoraggio, `tax_events.conto_id`
      valorizzato). Due componenti: cash a regime fisso (soglia giacenza media, non
      prorata per giorni di possesso — assunzione da confermare) + titoli a regime
      proporzionale 0,2% sul valore all'ultima data disponibile nell'anno, prorato
      per giorni di possesso (`conto_nav_giornaliero`, non richiede lo snapshot
      `OpenPosition` per singolo strumento). **Non copre l'obbligo di monitoraggio**
      (elenco riga per riga con ISIN/paese per ogni prodotto estero): richiederebbe
      l'ingestione di `OpenPosition`, non ancora fatta — vedi item sotto. Calcolato
      per il 2025: giacenza media cash 2.333,42 € sotto soglia 5.000 € → nessuna
      IVAFE fissa; titoli 96.813,73 € al 31/12, 365/365 giorni → **IVAFE
      proporzionale 193,63 €**. **Imposta totale RW 2025: 193,63 €**. Dettagli in
      `docs/decisioni-fiscali.md`.
- [x] **Riconciliazione posizioni vs OpenPosition IBKR** — nuova tabella
      `posizioni_aperte_ibkr` (migration `0011`), ingerita da `ibkr-flex-pull` (v7,
      `mapOpenPosition`) insieme a trades/cash/NAV. Modulo condiviso
      `supabase/functions/_shared/riconciliazione-posizioni.ts` + edge function
      `calcola-riconciliazione-posizioni` (JWT-protected, validazione — non scrive
      `tax_events`, non soggetta alla sicurezza anni già dichiarati). Confronta le
      quantità aperte per strumento (`tax_lots` vs ultima `posizioni_aperte_ibkr`).
      **Ha scovato 2 bug reali** nel backfill storico, entrambi dalla stessa causa:
      IBKR riusa lo stesso `transactionID` tra un `Trade` (vendita obbligazione) e la
      `CashTransaction` "Bond Interest Received" collegata (rateo liquidato alla
      vendita) — la chiave `(conto_id, ibkr_transaction_id)` non bastava, l'upsert
      del CashTransaction (processato dopo) sovrascriveva silenziosamente la vendita:
      1) T-bond USA, vendita 2025-09-30 (-4.000, migration `0011`); 2) OAT francese,
      **4 vendite** perse (-9.000 il 2024-11-07, -6.000/-10.000/-4.000 il 2025-05-19,
      migration `0012`+`0013`). Fix strutturale: indice unique esteso a
      `(conto_id, ibkr_transaction_id, tipo)` su `movimenti`/`tax_movements` (`tipo`
      disambigua, essendo 'trade' vs 'interessi'/'cedola'/...) + lookup
      `movimento_id` da tax_movements ora per `(transactionID, movimento.tipo)`
      composto, non solo transactionID. **Trovato anche un secondo bug strutturale**
      nel motore lotti stesso durante il ricalcolo manuale dell'OAT: il tie-break per
      movimenti sullo stesso giorno solare (per `id` casuale) poteva allocare una
      vendita su un acquisto dello stesso giorno eseguito DOPO nell'orario reale —
      fix: vendita sempre prima di acquisto a parità di data (`lot-matching.ts`,
      deployato `calcola-lotti-fiscali` v3). Riconciliazione finale: **18/18
      strumenti concordanti, zero divergenze** al 31/12/2025. La vendita OAT del
      2024-11-07 cade in un anno già dichiarato: corretto solo il ledger sottostante
      (nessun `tax_events` toccato per il 2024, mai calcolati da questo sistema).
      Quadro RT 2025 aggiornato di conseguenza (imposta totale invariata 1.035,72 €,
      ma riporto minusvalenze whitelist corretto a 600,90 € invece di 103,74 €).
      Dettagli completi in `docs/decisioni-fiscali.md`.
      **Limite noto, chiuso dall'item successivo**: la riconciliazione copre solo le
      QUANTITÀ, non l'obbligo di monitoraggio RW riga per riga — vedi "Quadro RW —
      dettaglio riga per riga" sotto.
- [x] **Quadro RW — dettaglio riga per riga** (monitoraggio valutario, distinto
      dall'IVAFE già calcolata sopra) — modulo condiviso
      `supabase/functions/_shared/quadro-rw-dettaglio.ts` (`costruisciDettaglioRW`) +
      edge function `calcola-quadro-rw-dettaglio` (JWT-protected, per conto,
      reporting puro: non scrive `tax_events`). Confronta l'ultimo snapshot
      `posizioni_aperte_ibkr` ≤ 31/12 anno precedente con l'ultimo entro l'anno
      richiesto. **Merge per ISIN, non conid**: scoperto un ETC reale (WisdomTree
      Physical Copper, ISIN `GB00B15KXQ89`) con conid diverso tra fine 2024
      (`41015909`) e fine 2025 (`42921905`) — un merge per conid avrebbe spezzato la
      posizione continua in due righe fittizie; fix applicato sia al modulo puro sia
      al lookup paese emittente nell'edge function (ISIN prima, conid come fallback
      per strumenti senza ISIN). Backfillato lo snapshot `OpenPosition` di fine 2024
      mancante (10 righe da `BUDGETING_2024.xml`, 28 righe totali in
      `posizioni_aperte_ibkr`; il 2023 non ne ha, conto appena aperto). Calcolato per
      il 2025: **19 strumenti con posizione a cavallo/entro l'anno** (9 tutto l'anno,
      9 acquistati in corso d'anno, 1 ceduto) **+ 4 casi limite** comprati e venduti
      interamente nel 2025 (T-bond USA, WBTC, NVDA, LVO) segnalati in
      `strumenti_attivita_non_in_snapshot` per revisione col commercialista. Dettagli
      in `docs/decisioni-fiscali.md`.
- [x] **Trasferimenti titoli IN** (`transfer_titoli`) — `mapTransfer` (ibkr-flex-parse.ts)
      ora restituisce anche un `TaxMovementRow` sintetico (`tipo='acquisto'`) quando
      `direction='IN'` e c'è quantità, usando il campo `cost` del `Transfer` come base
      di costo — prima il lotto trasferito spariva semplicemente dal motore (nessun
      `tax_movement` generato). **Limite noto**: il `Transfer` di IBKR non porta una
      data di acquisto originale (nessun campo `openDateTime`, solo la data del
      trasferimento stesso) — `data_acquisto` del lotto sarà quindi la data del
      trasferimento, non quella reale. Non cambia l'aliquota (in Italia il capital
      gain non dipende dal periodo di possesso), solo `giorni_detenzione` risulterà
      sottostimato. Trasferimenti OUT restano fuori scope (nessun caso reale finora).
      **Non testato su dati reali** (`transfer_titoli`: zero occorrenze nel backfill
      2023-2025, solo `transfer_cassa`) — pronto per la prossima volta che ricorre.
- [x] **Opzioni senza ISIN** — `ibkr-flex-pull` (v9) ora crea/aggiorna
      `tax_instruments` anche per strumenti senza ISIN (opzioni e altri derivati),
      usando `conid` come chiave alternativa (nuovo indice unique `conid`, migration
      `0015`) con due upsert separati (Postgres richiede un solo vincolo per
      `ON CONFLICT`). Anche il collegamento `tax_movements.instrument_id` ora risolve
      per `conid` quando `isin` è assente (`TaxMovementRow.conid`, nuovo campo). Prima
      le opzioni non venivano create affatto (`.filter(s => s.isin)` le scartava) —
      l'unico caso reale (OKLO call) era stato inserito e collegato **a mano** durante
      il backfill (vedi commit precedenti); ora un pull futuro lo farebbe da solo.
      Verificato che lo schema del caso OKLO esistente resta coerente con la nuova
      logica (`isin=null`, `conid` valorizzato).

### Fondi pensione — motore di calcolo (deduzione versamenti)

- [x] **Quadro RP — deduzione versamenti** (art. 10 c.1 lett. e-bis TUIR) — modulo
      condiviso `supabase/functions/_shared/fondo-pensione.ts` + edge function
      `calcola-fondo-pensione` (JWT-protected, per utente su tutti i suoi
      `fondi_pensione`). `tax_events.quadro` esteso con il valore `'RP'` (migration
      `0014`). Tetto 5.164,57 €/anno seminato in `config_fiscale_parametri` per
      2025/2026. Stessa sicurezza anni già dichiarati di RT/RM/RW.
      **Scope deliberatamente limitato** alla sola deduzione dei versamenti:
      - l'**imposta sostitutiva sul rendimento** non viene ricalcolata: è già
        trattenuta dal fondo stesso, non è un adempimento dell'aderente;
      - la **tassazione in uscita** (aliquota 15%→9% in base agli anni di
        iscrizione, art. 11 c.6 D.Lgs 252/2005) è implementata come funzione pura
        pronta all'uso (`aliquotaTassazioneUscita`) ma **non collegata a nessuna
        edge function**: rilevante solo a un riscatto/rendita effettivo, che non è
        ancora avvenuto per nessun fondo in questo progetto.
      - l'eccedenza oltre il tetto (non deducibile) viene calcolata e riportata
        nell'evento — va tracciata perché esente da tassazione al riscatto (art. 11
        D.Lgs 252/2005), ma non c'è ancora una tabella dedicata al suo cumulo
        pluriennale (nessun dato reale su cui costruirla: `fondi_pensione`,
        `fondo_pensione_versamenti`, `fondo_pensione_posizione` sono **tutte vuote**
        — l'utente non ha ancora registrato nessun fondo).
      - Verificato solo con dati sintetici offline (nessun fondo reale registrato
        finora): tetto rispettato, eccedenza calcolata correttamente, aliquota
        uscita corretta ai limiti noti (15 anni→15%, 35+ anni→9% pavimento).

## Frontend — auth + prime viste INVESTIMENTI fatte, UTENZE/INTROITI ancora rimandate

> Decisione originale: nessun frontend finché il modello dati non è più maturo, per
> evitare di costruire viste su uno schema ancora in movimento e doverle poi rifare.
> Il criterio di riconsiderazione (Fase 1 funzionalmente completa: RT ✅, RM ✅, RW ✅,
> fondi pensione ✅) è stato raggiunto in questa sessione. **Ridiscusso con l'utente**:
> la decisione resta valida per le **viste** (dashboard investimenti/utenze — UTENZE in
> particolare ha lo schema ancora visibilmente in movimento, vedi le 3 migration di
> correzione in Fase 2), ma **non per l'autenticazione**, che è infrastruttura
> indipendente dallo schema di dominio (`auth.users`, non `tax_*`/`utenze_*`) e serve a
> validare le edge function via HTTP reale invece che solo via SQL diretto.

- [x] **Login + shell minimale** — `index.html` (carica Supabase JS SDK via CDN,
      nessun bundler), `js/shared/config.js` (`SUPABASE_URL`/`SUPABASE_ANON_KEY`,
      pubblica per design), `js/shared/api.js` (`invokeFunction()` — wrapper su
      `supabaseClient.functions.invoke()`), `js/shared/auth.js` (boot sequence:
      `getSession()` → `pages/login.html` o `pages/home.html`; login/logout via
      `signInWithPassword`/`signOut`), `pages/login.html` + `pages/home.html`,
      `css/main.css` (stile minimo, esplicitamente "funzionale non definitivo").
      `pages/home.html` non è una dashboard: è un pannello che invoca a mano
      qualunque edge function deployata (dropdown + textarea JSON body + output
      grezzo) — serve solo a validare end-to-end, non a mostrare dati con una UI
      pensata. Preview locale via `.claude/launch.json` del repo `lmadvisorylive`
      (config `budgeting-static`, `http-server` su porta 5500 — `serve` scartato per
      un bug di redirect delle clean URL su percorsi annidati `pages/*.html`).
      **Validato dal vivo dall'utente**: login riuscito con l'utente Auth già
      esistente (`madaschimattia@gmail.com`, creato in una sessione precedente) e
      prima invocazione HTTP reale di un'edge function (`calcola-quadro-rt`,
      `{"anno":2025}`) — risposta coincidente esattamente coi valori calcolati via
      SQL in precedenza (plusvalenza ordinaria 3.952,21€/imposta 1.027,57€,
      minusvalenza whitelist riportata 600,90€, provento OICR 31,34€/imposta 8,15€).
      Prima conferma che l'intera catena login→JWT→edge function→business logic
      funziona anche fuori da SQL diretto.
- [x] **Prime viste reali — Portafoglio e Fiscale** (per INVESTIMENTI, l'unico
      dominio con schema stabile — vedi nota sopra sul perché UTENZE resta
      escluso). `pages/portafoglio.html` + `js/client/portafoglio.js`: holdings
      aggregati client-side da `tax_lots` aperti (raggruppati per
      `instrument_id`, quantità/costo sommati) con valore attuale
      dall'ultimo snapshot `posizioni_aperte_ibkr` disponibile (match per ISIN,
      conid come fallback) — **nessuna nuova edge function**, sono tutte
      tabelle normali protette da RLS, la select diretta via `supabaseClient`
      basta. `pages/fiscale.html` + `js/client/fiscale.js`: legge `tax_events`
      per anno selezionato, raggruppati per quadro (RT/RM/RW/RP) in tabelle
      leggibili con subtotale imposta; pulsante "Ricalcola" invoca in sequenza
      `calcola-quadro-rt`/`rm`/`rw` + `calcola-fondo-pensione` per l'anno
      scelto, poi ricarica gli eventi. Nav condivisa (`initNav()` in
      `auth.js`) tra `home`/`portafoglio`/`fiscale`/`test` (il pannello di
      invocazione grezza di prima è stato spostato in `pages/test.html`,
      resta utile per il debug). Formattatore EUR condiviso in
      `js/shared/format.js`. **Verificato dall'utente**: le pagine si
      caricano e navigano correttamente da autenticato; il contenuto
      (correttezza dei dati aggregati) resta da validare nel dettaglio.

## Fase 2 — UTENZE (ingestione Drive → PDF → Claude) — in corso

Pipeline separata da IBKR: parsing PDF via Claude API, non Flex Web Service.

- [x] **Struttura cartelle Drive creata** — `BUDGETING/` con le 4 sezioni del design
      doc (`01_INVESTIMENTI/{IBKR,ALTRI_CONTI}`, `02_UTENZE/`, `03_INTROITI/{BUSTE_PAGA,CU,CONTRATTO_LAVORO}`,
      `04_FISCALE/DICHIARAZIONI_PREGRESSE`). Sotto `02_UTENZE/` una cartella
      domicilio placeholder (`CASA (rinomina con il nome reale del domicilio)`)
      con le 6 sottocartelle categoria (`LUCE`, `GAS`, `ACQUA`,
      `INTERNET_TELEFONO`, `CONDOMINIO`, `AFFITTO`) — **da rinominare** col nome
      reale del domicilio (va a corrispondere a `domicili.nome`) e da popolare
      con le bollette reali: non ne esistevano ne' su Drive ne' in locale, quindi
      né la struttura né il prompt di estrazione sono stati validati contro un
      documento reale.
- [x] **Schema** (migration `0017`): `domicilio_intestatari` (ponte quota-based
      domicilio↔intestatario, stesso pattern di `conto_intestatari`, applica la
      cointestazione anche a UTENZE come da decisione architetturale) +
      `utenze_bollette` (bolletta normalizzata: `domicilio_id`,
      `documento_grezzo_id`, `categoria` CHECK chiuso su
      luce/gas/acqua/internet_telefono/condominio/affitto — `fornitore` resta
      testo libero, non anagrafica, troppo eterogeneo per un uso personale;
      `importo`/`imponibile`/`iva` sempre EUR, no conversione valuta necessaria;
      `raw_estrazione` jsonb conserva l'output grezzo Claude per ri-derivazione
      senza richiamare l'API). `documenti_grezzi.sezione='utenze'` era gia'
      supportato da Fase 0, nessuna modifica li' necessaria.
- [x] **Edge function `estrai-bolletta`** (JWT-protected, per utente) — data un
      `documento_grezzo_id` gia' archiviato su Storage (upload manuale per ora),
      scarica il PDF, chiama Anthropic API (`claude-haiku-4-5`) con
      `tool_choice` forzato su uno schema fisso (`_shared/estrazione-bolletta.ts`,
      `registra_bolletta`) per evitare ambiguita' di parsing di JSON libero,
      inserisce la riga in `utenze_bollette` e aggiorna
      `documenti_grezzi.stato_elaborazione`. `categoria`/`domicilio_id` sono
      passati dal chiamante (metadati noti dalla posizione del file), non
      inferiti dal contenuto del PDF. Deployata (`ACTIVE`, v1) ma **non ancora
      invocata con un documento reale** — manca sia una bolletta reale sia il
      secret.
      **Aggiornamento**: il secret `ANTHROPIC_API_KEY` **risulta ora configurato**
      su questo progetto Supabase (confermato dall'utente via Dashboard → Edge
      Functions → Secrets). Resta comunque **non invocata contro un documento
      reale**: il blocco residuo non è più il secret ma l'assenza di un JWT
      utente in sessione per autenticare la chiamata HTTP (stesso limite di
      `ibkr-flex-pull` — nessun login/frontend costruito in questo repo).
- [ ] **Sync automatico da Drive** — non ancora costruito. Richiederebbe una
      edge function schedulata con credenziali OAuth Google (Drive API scope),
      stesso tipo di setup di `GOOGLE_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN` gia'
      usato in LMadvisory per Calendar — non ancora fatto qui. Fino ad allora,
      bootstrap manuale come per Fase 1: upload diretto su Storage +
      insert manuale in `documenti_grezzi`, poi invocazione di
      `estrai-bolletta`.
- [ ] **Viste (singola utenza / per domicilio / aggregata) e analisi scostamenti
      rispetto allo storico** — non iniziate, dipendono da avere dati reali in
      `utenze_bollette` da cui derivare la vista.
- **Decisione presa implicitamente**: AFFITTO incluso in UTENZE (la struttura
      cartelle del design doc lo prevede gia' come sottocategoria) — la
      "decisione aperta" nel documento di memoria del progetto è considerata
      chiusa in questo senso salvo indicazione contraria.
- **Decisione presa**: AFFITTO e CONDOMINIO restano categorie/cartelle
      **separate** (non accorpate in una unica "CASA"), anche se pagati insieme
      (bonifico trimestrale unico che include l'anticipo condominiale) — per
      poter calcolare in futuro lo scostamento anticipo-pagato vs
      consuntivo-reale, che si perderebbe se fossero un'unica voce. La cartella
      domicilio (`MILANO - MAC MAHON`) è già di fatto il raggruppamento "casa"
      richiesto: LUCE/GAS/ACQUA/INTERNET_TELEFONO/AFFITTO/CONDOMINIO sono suoi
      figli diretti.
- [x] **Primo caricamento reale — domicilio Milano/Mac Mahon** (migration
      `0018` + correzioni `0019`): 1 domicilio, 2 intestatari (Mattia Madaschi
      + Martina Tombini, cointestatari del contratto di locazione, quota
      50/50 in `domicilio_intestatari`), **30 righe `utenze_bollette`** —
      12 bollette luce A2A Energia (feb-2024→giu-2026; buco maggio-novembre
      2024 poi colmato, vedi migration `0032`), 15 conti telefonici Vodafone per la linea internet
      fissa (set-2024→dic-2025, **nessun buco**), 1 riga di riferimento per il
      contratto di affitto (rata trimestrale 5.340€ = canone 4.500€ +
      anticipo condominiale 840€, **non** prova di pagamento del singolo
      trimestre — nessun estratto conto disponibile), 2 righe condominio
      (quota a carico conduttore: 1.238,56€ esercizio 2023/24 pro-rata,
      1.712,73€ esercizio 2024/25 — vedi correzione `0020` sotto).
      **Estrazione fatta a mano** (lettura diretta del contenuto testuale dei
      PDF via Drive), non tramite `estrai-bolletta`: quella edge function
      resta quindi **non ancora validata contro dati reali** (vedi punto
      sopra — non è più bloccata dal secret ma dal JWT). I documenti sorgente
      sono su Drive (`BUDGETING/02_UTENZE/MILANO - MAC MAHON/`) ma non ancora
      copiati su Storage/`documenti_grezzi` — stesso "debito di
      archiviazione" di Fase 1 (nessun JWT utente disponibile in sessione).
- [x] **Conguaglio condominio risolto con fonte autorevole** (migration `0020`)
      — il limite noto sul consuntivo condominiale (tabella del PDF
      amministratore poco affidabile per voce dopo l'OCR) è superato: l'utente
      ha caricato `Prospetto conguaglio (da inviare).xlsx`, una riconciliazione
      fatta da lui e **approvata dalla proprietaria**, che separa esplicitamente
      quota Proprietà (spese straordinarie, escluse) da quota a carico
      conduttore, per esercizio. Le 2 righe condominio sono state sostituite
      con gli importi di questo prospetto (`importo` = quota a carico
      conduttore): **1.238,56€** (2023/24, pro-rata 256/366gg dal 19/01/2024)
      e **1.712,73€** (2024/25, anno intero) — **totale 2.951,29€**. Il
      prospetto riporta anche gli acconti versati (2.520€ + 3.360€ = 5.880€,
      le rate da 840€/trimestre già incluse nel canone affitto) e il
      **conguaglio complessivo a favore del conduttore: 2.928,71€**, non
      ancora restituito/compensato — importo significativo, tracciato in nota
      sulle righe (nessuna colonna dedicata in `utenze_bollette` per
      acconto/conguaglio, valutare se serve in una fase successiva quando ci
      sarà più di un caso simile).

## Fase 3 — INTROITI DA LAVORO — in corso

Stessa pipeline Drive/Claude di UTENZE: documento grezzo → dato normalizzato.

- [x] **Schema ramo dipendente** (migration `0021`): `introiti_buste_paga`
      (`intestatario_id` NOT NULL FK → `intestatari`, `documento_grezzo_id`
      nullable FK → `documenti_grezzi`; campi datore_lavoro, periodo_da/a,
      data_pagamento, lordo, netto, irpef_trattenuta, contributi_inps,
      addizionali_regionali_comunali, tfr_maturato — solo informativo, nessuna
      tabella dedicata al cumulo TFR ancora — altre_trattenute, note,
      raw_estrazione). `documenti_grezzi.sezione='introiti'` era già
      supportato da Fase 0, nessuna modifica lì necessaria.
      **Decisione di design**: niente colonna `tipo_reddito` discriminatore su
      questa tabella — il ramo autonomo (fatture/ritenute/contributi P.IVA,
      campi troppo diversi da una busta paga) sarà una tabella separata
      (`introiti_fatture_autonomo`, non ancora costruita: nessun dato reale su
      cui progettarla) unita in una vista `v_introiti_totali` quando esisterà
      — l'identità stessa della tabella è il discriminatore, non serve una
      colonna ridondante su un ramo solo.
- [x] **Edge function `estrai-busta-paga`** (JWT-protected, per utente) —
      stesso pattern esatto di `estrai-bolletta`: dato un `documento_grezzo_id`
      già archiviato su Storage, scarica il PDF, chiama Anthropic API
      (`claude-haiku-4-5`) con `tool_choice` forzato
      (`_shared/estrazione-busta-paga.ts`, `registra_busta_paga`), inserisce
      la riga in `introiti_buste_paga` e aggiorna
      `documenti_grezzi.stato_elaborazione`. `intestatario_id` passato dal
      chiamante (proprietà del dato), non inferito dal PDF. Deployata
      (`ACTIVE`, v1) ma **non ancora invocata con un documento reale**: i PDF
      sono su Drive, non ancora copiati su Storage/`documenti_grezzi` (stesso
      "debito di archiviazione" di UTENZE/Fase 1 — nessun upload da JWT in
      sessione), quindi l'estrazione delle 9 buste paga sotto e' stata fatta
      a mano leggendo il testo dei PDF via Drive, non tramite questa function.
- [x] **Primo caricamento reale — buste paga Generali** (migration `0022`):
      Prima versione: 9 righe (solo ott-2025→giu-2026), IRPEF/INPS lasciati
      null (non isolabili dal testo compresso), dicembre modellato come riga
      unica. **Corretto integralmente in migration `0023`** dopo che l'utente
      ha (a) caricato molte più buste paga di quanto risultasse — 38
      documenti reali, **luglio 2023** (mese di assunzione) **→ giugno
      2026** — e (b) fornito uno screenshot di un cedolino che rivela la
      struttura esatta delle colonne (Imponibili/Contributi INPS, Imponibile
      Fiscale/IRPEF lorda, TFR Previd. Mese, Totale Trattenute, Totale
      Competenze), confermata anche dall'intestazione di un PDF illeggibile
      come dati (stesse colonne, stesso ordine). Con la chiave di lettura
      corretta: **38 righe** `introiti_buste_paga`, di cui **30 con
      IRPEF/contributi INPS popolati** (letti dalle colonne dedicate,
      `altre_trattenute` = Totale Trattenute − IRPEF − INPS, così la somma
      riconcilia sempre esattamente col totale ufficiale del cedolino) e 8
      lasciate null (aprile-novembre 2024: il blocco IRPEF mensile è assente
      dal testo estratto per 8 mesi consecutivi, sostituito dagli stessi
      valori cumulativi progressivi — anomalia del sistema payroll di
      quel periodo, non del parsing; null per non fabbricare un numero). Il
      "lordo" e' ora il **Totale Competenze** ufficiale del cedolino (non più
      una somma manuale di voci scelte a occhio, che aveva sottostimato
      alcuni mesi con rimborsi/indennità non ovvi). **Dicembre corretto da
      riga-unica a due righe per anno** (2023/2024/2025): l'utente ha
      confermato che tredicesima (anticipata a metà mese) e cedolino di fine
      mese sono **due incassi reali separati**, non uno che netta l'altro —
      confermato anche numericamente (il rapporto tra "Acconti" e trattenute
      non torna se si ipotizza una sottrazione, torna esattamente trattandoli
      come due incassi pieni). Unica lacuna: **gennaio 2025** non caricabile
      (PDF illeggibile come dati, solo intestazione colonne). Caricati anche
      3 Certificazioni Uniche (2023/2024/2025) e 3 documenti contrattuali
      (lettera assunzione, accordo aziendale, bonus/promozione) — non
      modellati in `introiti_buste_paga` (formato annuale/non periodico),
      utili in futuro per riconciliazione.
- [ ] **Viste (per periodo / aggregata / scostamenti busta-vs-busta)** — non
      iniziate, dipendono da avere dati reali in `introiti_buste_paga`.
- [ ] **TFR e fondo pensione** — decisione di collocazione ancora aperta
      (qui in INTROITI o in INVESTIMENTI, vedi memoria di progetto §4.1/4.3):
      per ora `tfr_maturato` è solo un campo informativo per periodo, senza
      cumulo né collegamento a `fondi_pensione`.
- [ ] **Ramo autonomo (partita IVA)** — non iniziato, rimandato finché non
      serve davvero (nessun dato reale, nessuna urgenza dichiarata).

## Fase Verifica — riscontro utente

> L'utente ha chiesto di raccogliere qui, in un unico posto, tutti i punti che
> ha segnalato di voler ricontrollare di persona prima di fidarsi dei dati
> (query SQL dirette, cifre trascritte a mano dai PDF, assunzioni fatte in
> assenza di conferma). Non è un lavoro da fare in questa sessione: è la lista
> di spunta per la verifica finale dell'utente. Aggiornare (spuntare / togliere
> / aggiungere righe) man mano che i punti vengono chiusi.

### FONDI PENSIONE

- [ ] **AXA Save for Life Pension (Lussemburgo) — deducibilità RP non confermata**
      (migration `0036`): i 2 versamenti 2022 (1.600€ + 1.600€ lordi) sono stati
      inseriti con `deducibile=false` di default, perché la deducibilità quadro
      RP di una polizza assicurativo-previdenziale lussemburghese non è
      automatica come per un fondo pensione italiano armonizzato — verificare
      col commercialista se e quanto è deducibile.
- [ ] **AXA Save for Life Pension — monitoraggio RW** — `is_estero=true` ma
      non ancora verificato se questa polizza richiede una riga RW (IVAFE) a
      parte rispetto agli altri asset esteri già monitorati.
- [ ] **AXA — documento 2023 mancante** (as-of 01/01/2024): nessun versamento
      né controvalore inseriti per quell'anno, l'utente non è sicuro di poterlo
      recuperare. Se recuperato, aggiungere versamento/posizione mancanti.
- [ ] **AXA versamenti — importo lordo vs netto** — registrato l'importo
      lordo pagato (1.600€ per versamento) come `importo_eur`, non il netto
      investito (1.536€, al netto del caricamento AXA ~4%) — confermare che
      sia la convenzione desiderata per "quanto ho versato".
- [x] **Fondo Pensione Generali (F.P.G.G.) — contributo lavoratore 2024 non
      dedotto** (migration `0037`): i 326,88€ su 349,64€ dichiarati "non
      dedotti" nel Prospetto 2024 erano già stati gestiti a suo tempo col
      commercialista — confermato dall'utente, `deducibile=false` sull'intero
      importo 2024 resta corretto così com'è.
- [x] **Fondo Pensione Generali — dati 2025** — contributi 2025 (375,60€
      lavoratore, 3.702,41€ datore, 5.131,10€ TFR) confermati corretti
      dall'utente.

### INVESTIMENTI

- [ ] **Riconciliazione RT 2025 post-fix bug transactionID** — il riporto
      minusvalenze whitelist è stato ricalcolato da 103,74€ a 600,90€ dopo aver
      backfillato 5 vendite (T-bond + 4 OAT) perse per un bug di collisione
      `transactionID`. Imposta totale RT 2025 invariata (1.035,72€) ma vale la
      pena un controllo incrociato con l'estratto conto IBKR.
- [ ] **RW — 4 casi limite comprati e venduti nello stesso anno** (T-bond USA
      `US91282CBQ33`, WBTC, NVDA, LVO) — verificare col commercialista se un
      possesso infrannuale richiede comunque una riga di monitoraggio RW
      (norma non del tutto univoca sul punto).
- [ ] **Classificazione OICR/non-OICR** — verificata via web search per i casi
      meno ovvi (WisdomTree Physical Bitcoin, Amundi Physical Gold, Carlyle
      Secured Lending) ed **estesa per pattern** agli altri fondi della stessa
      famiglia di emittenti, non tutti verificati singolarmente.
- [ ] **Minusvalenze OICR non compensabili** (quadro RT) — la reale
      compensabilità delle minus OICR "armonizzati" post D.Lgs 2011/2012 resta
      un punto aperto per il commercialista.
- [ ] **RM — eccedenza credito d'imposta estero non utilizzata** — IBKR non è
      sostituto d'imposta italiano, va autoliquidato; verificare che il
      credito d'imposta sia applicato correttamente in dichiarazione.
- [ ] **`config_fiscale_parametri` anno 2025** — seminato con `verificato=false`
      (stessi valori del 2026, mai confermati da fonte ufficiale per il 2025).
- [ ] **IVAFE cash regime fisso non prorato per giorni di possesso** —
      assunzione da confermare col commercialista se un conto viene aperto o
      chiuso a metà anno.
- [ ] **Trasferimenti titoli IN** (`transfer_titoli`) — implementato ma **mai
      testato su dati reali** (zero occorrenze finora); `data_acquisto` del
      lotto trasferito è la data del trasferimento, non quella reale.
- [ ] **Fondo pensione — aliquota in uscita** — funzione pronta ma mai
      esercitata (nessun riscatto reale, nessun fondo ancora registrato in
      `fondi_pensione`).
- [ ] **Whitelist paesi** (134 righe, Decreto 4/9/1996) — elenco non
      auto-aggiornante: verificare periodicamente se ci sono aggiornamenti
      (art. 1-bis).
- [ ] **Vista Portafoglio/Fiscale/Dashboard (frontend React /web)** —
      struttura e navigazione confermate ok dall'utente, ma i **numeri
      mostrati** (holdings aggregati, allocazione per asset class, quadri
      RT/RM/RW/RP, proiezioni) non sono ancora stati controllati nel
      dettaglio — l'assistente non può testarli con un login reale (policy:
      niente inserimento credenziali), quindi la verifica finale è manuale.
- [ ] **`tax_instruments.asset_class`** (migration `0031`, 19 strumenti in
      possesso classificati leggendo la descrizione) — due casi limite da
      confermare: `CGBD` (Carlyle Secured Lending, una BDC) oggi in Equity;
      `BTCWUSD`/`IB1T` (i due tracker Bitcoin) oggi in Alternative. Usata per
      raggruppare Portafoglio e per l'allocazione in Dashboard.

### UTENZE (domicilio Milano — Mac Mahon)

- [x] **Buco bollette luce maggio-dicembre 2024 colmato** (migration `0032`,
      scoperto dall'utente confrontando il grafico con le fatture reali su
      Drive): aggiunte mag-giu, lug-ago, set-ott 2024 (bimestrali regolari) +
      la bolletta di **chiusura contratto** 01 nov–09 dic 2024 (rinnovo
      tariffario A2A il 9/10 dicembre, da cui la riga "dic '24" già presente
      partiva proprio dal 10 — ora spiegato, non più un'anomalia). Quest'ultima
      include 124,08€ di oneri una tantum (contributo allacciamento + diritto
      fisso vendita) non legati al consumo — verificare se preferisci scorporarli
      dal calcolo ricorrente invece di lasciarli nella riga (oggi: nota
      esplicativa, frequenza 'bimestrale', quindi ancora nel calcolo).
      Storico ora continuo feb-2024→giu-2026, nessun buco residuo.
- [ ] **Riga AFFITTO** — è un riferimento ai termini contrattuali (rata
      5.340€/trimestre), **non prova di pagamento** dei singoli trimestri:
      verificare dall'estratto conto che i bonifici trimestrali corrispondano.
- [ ] **Quota cointestazione 50/50** (Mattia/Martina in
      `domicilio_intestatari`) — assunzione di default in assenza di
      indicazione contraria, confermare che sia la ripartizione corretta.
- [ ] **`spese_fisse_manuali.intestatario_id`** — le 3 subscription seedate
      (Spotify Family, Anthropic, HoMobile) sono tutte attribuite a Mattia:
      confermare che nessuna vada invece attribuita a Martina o considerata
      condivisa, ora che il filtro utente del frontend usa questo campo.
- [ ] **Conguaglio condominiale** (2.928,71€ a favore del conduttore, da
      "Prospetto conguaglio" approvato dalla proprietaria) — verificare che sia
      stato effettivamente restituito/compensato, e aggiornare quando succede.

### INTROITI (buste paga Generali)

- [ ] **8 mesi con IRPEF/INPS null** (aprile-novembre 2024) — anomalia nel
      testo estratto (blocco IRPEF mensile assente, sostituito da valori
      cumulativi progressivi identici per 8 mesi) — verificare sui PDF
      originali se il dato è recuperabile leggendoli direttamente.
- [ ] **Luglio 2023 e tredicesima 2023** — blocco "Contributi" con
      un'anomalia numerica (-13,68 non riconciliabile), `altre_trattenute`
      lasciato null su queste righe.
- [ ] **Gennaio 2025 mancante** — il PDF caricato conteneva solo l'intestazione
      delle colonne, non i dati (probabile scansione non testuale) — ricaricare
      se si trova una versione leggibile.
- [ ] **Controllo a campione generale** — vista la mole di trascrizione manuale
      (38 mesi), ricontrollare almeno qualche mese a caso oltre a quelli già
      segnalati sopra, in particolare i primi mesi (formato leggermente diverso
      per via dell'assunzione a metà mese di luglio 2023).
- [ ] **Dicembre a due righe (2023/2024/2025)** — confermato dall'utente che
      tredicesima e cedolino di fine mese sono due incassi separati; verificare
      che l'estratto conto bancario mostri effettivamente due bonifici distinti
      per ciascun dicembre.
- [ ] **TFR maturato** — solo campo informativo per periodo, nessun cumulo né
      collegamento a `fondi_pensione`: verificare se/quando serve integrarlo.

## Fase 4 — BUDGET — in corso

> Scope deciso con l'utente: **non** traccia la spesa variabile (niente
> ingestione estratto conto/carta) — lavora solo su costi fissi (`utenze_bollette`)
> vs reddito (`introiti_buste_paga`), per capire se i costi fissi sono
> sostenibili nel lungo periodo e come allocare il margine (fondo emergenza,
> poi risparmio/investimento). Mai raccomandazioni di prodotto specifico —
> resta fuori dal perimetro della consulenza regolata (vedi memoria di
> progetto). "Flessibile e personalizzabile ma con soglie standard per ora" —
> l'utente ha esplicitamente chiesto una struttura pronta per calibrare le
> soglie per persona/fascia di reddito in futuro (chi guadagna 100k non ha la
> stessa % sostenibile di beni di prima necessità di chi guadagna 10k), non
> implementato ora ma non richiede migrazioni quando succederà.

- [x] **Schema** (migration `0024`): `utenze_bollette.frequenza` (CHECK
      mensile/bimestrale/trimestrale/semestrale/annuale/una_tantum) — necessaria
      perché alcune righe (es. affitto) hanno `periodo_da/periodo_a` che copre
      la durata del contratto, non il periodo fatturato dall'importo: senza la
      frequenza esplicita, dividere per i mesi di `periodo_da/periodo_a`
      darebbe un costo mensile assurdo. Backfill delle 30 righe utenze
      esistenti per categoria (luce bimestrale — confermato dalle bollette A2A
      stesse; internet mensile; affitto trimestrale; condominio annuale).
      `config_budget_parametri` (soglie sostenibilità + target fondo
      emergenza), stesso pattern chiave/valore di `config_fiscale_parametri`
      ma con `intestatario_id` **nullable** fin da subito (null = default
      globale, valorizzato = override personalizzato per persona) — questo è
      il pezzo che rende la struttura "personalizzabile in futuro senza
      migrazioni", anche se oggi esiste solo il default globale. Seed:
      soglia sostenibile 40%, soglia attenzione 55%, fondo emergenza 3-6 mesi
      di costi fissi.
- [x] **Motore di sostenibilità** — modulo puro
      `supabase/functions/_shared/budget-sostenibilita.ts`
      (`calcolaSostenibilita`) + edge function `calcola-budget-sostenibilita`
      (JWT-protected, per utente, reporting puro — non scrive nulla, nessuna
      sicurezza anni già dichiarati). Reddito ricorrente mensile = **mediana**
      dei netti (non la media): robusta ai mesi con bonus/STI/premio e alla
      tredicesima senza doverli classificare esplicitamente come "variabili"
      — la media (che li include) resta calcolata a parte come "reddito medio
      annualizzato" per il quadro completo. Costo mensile equivalente per
      categoria = `importo / mesi_per_frequenza`, mediato sulle righe
      disponibili; righe con `frequenza` null o `una_tantum` escluse dal
      calcolo. Include un trend (prima metà vs seconda metà del periodo
      osservato) per capire se il rapporto costi/reddito sta migliorando o
      peggiorando nel tempo, non solo uno snapshot.
      **Quota di cointestazione applicata**: quando si passa un
      `intestatario_id`, i costi utenze (che sono per l'intero domicilio)
      vengono scalati per la `quota_percentuale` di quella persona in
      `domicilio_intestatari` prima del confronto col suo reddito personale —
      bug trovato e corretto nella prima versione (v1 confrontava il 100% dei
      costi condivisi col reddito di una sola persona, gonfiando il rapporto
      da ~21% a ~45%).
      **Condominio escluso dal calcolo ricorrente** (frequenza portata a
      `una_tantum` per le 2 righe esistenti): per questo domicilio la quota
      condominiale è già pagata dentro la rata trimestrale di affitto (840€/
      trim inclusi nei 5.340€/trim), quindi la riga condominio (il conguaglio
      riconciliato) sommata alla riga affitto avrebbe contato lo stesso costo
      due volte con due numeri diversi — il conguaglio va integrato solo
      ex-post quando confermato (non è ricorrente/prevedibile), non nel
      calcolo dei costi fissi ricorrenti.
      **Calcolato per Mattia Madaschi (quota 50%)**: costi fissi 938,80€/mese
      (affitto+condominio 890€ + luce 36,35€ + internet 12,45€), reddito
      ricorrente mensile 4.395,63€ (mediana su 38 buste paga) → **rapporto
      21,4%, giudizio sostenibile**, margine 3.456,83€/mese, fondo emergenza
      target 2.816,40€–5.632,80€.
- [x] **`spese_fisse_manuali`** (migration `0026`) — costi fissi personali a
      inserimento manuale, senza fattura/PDF e senza legame a un domicilio
      (a differenza di `utenze_bollette`): subscription digitali (streaming,
      software, fitness) + su richiesta esplicita dell'utente anche
      assicurazione/bollo auto, canone bancario, altre assicurazioni
      (casa/vita/salute) — **non** selezionato invece un finanziamento/leasing
      auto (non applicabile all'utente). Colonne: `intestatario_id` NOT NULL,
      `nome`, `categoria` (streaming/software/fitness/veicolo/assicurazione/
      bancario/altro), `importo`, `frequenza` (stesso enum di
      `utenze_bollette`), `data_inizio`/`data_fine`/`attivo` (per gestire
      disdette senza cancellare lo storico). `calcola-budget-sostenibilita`
      aggiornata (v3): legge le righe `attivo=true` (filtrate per
      `intestatario_id` se passato) e le aggiunge a `bolletteInput` **senza
      scalarle per quota** (a differenza delle utenze del domicilio
      cointestato, sono già per intero il costo della singola persona) —
      riusa il motore puro invariato.
      **Popolata** (migration `0027`) con i dati reali di Mattia Madaschi dal
      01/01/2024 (storico non ritracciato oltre, in linea con INVESTIMENTI):
      Spotify Family 20,99€/mese, Anthropic (Claude) 21,96€/mese, HoMobile
      5,99€/mese (categorizzato `altro`: piano cellulare personale, non legato
      al domicilio). RC auto/Bollo auto e Canone conto **non** inserite —
      l'utente non paga l'auto e ha solo conti correnti gratuiti; le categorie
      `veicolo`/`bancario` restano valide nell'enum per un uso futuro.
      **Ricalcolo aggiornato** per Mattia Madaschi (quota 50%): costi fissi
      **987,74€/mese** (938,80€ utenze/casa + 48,94€ subscription), reddito
      ricorrente mensile 4.395,63€ → **rapporto 22,47%, giudizio sostenibile**,
      margine 3.407,89€/mese, fondo emergenza target 2.963,22€–5.926,44€.
- [x] **Vista frontend** — `pages/budget.html` + `js/client/budget.js`, stesso
      pattern di Portafoglio/Fiscale: invoca `calcola-budget-sostenibilita`
      (per ora fisso su Mattia Madaschi, unico con buste paga caricate; da
      trasformare in selettore se in futuro anche Martina avrà introiti) e
      mostra rapporto costi/reddito, giudizio (badge sostenibile/attenzione/
      rischio), margine, fondo emergenza target, costi per categoria e trend.
      Link "Budget" aggiunto alla nav di tutte le pagine. Verificata solo la
      resa statica del fragment (nessun errore console); il flusso
      autenticato va controllato dall'utente dopo login (nessuna credenziale
      inserita dall'assistente, per policy).
- [ ] **Personalizzazione soglie per persona/fascia di reddito** — struttura
      pronta (`config_budget_parametri.intestatario_id`), metodologia di
      calibrazione non ancora definita (decisione esplicitamente rimandata
      dall'utente).

## Fase 5 — ESPERTO DI FINANZA — in corso

Scope deciso con l'utente: due blocchi — **assistente chat** (aggregati soltanto,
mai il dettaglio riga per riga, scelta esplicita per semplicità) e **proiezioni
interattive** (rendimento atteso di default = CAGR pesato sull'allocazione
attuale del portafoglio, ma ogni variabile — valore iniziale, rendimento,
contributo mensile, orizzonte — liberamente modificabile dall'utente).

- [x] **Assistente chat** — `chat_conversazioni`/`chat_messaggi` (migration
      `0028`), stesso pattern già in produzione su LMadvisory ma adattato a
      un'app single-user (`user_id` diretto, nessun `cliente_id`/advisor
      esterno). Edge function `chat-assistente` (Claude Haiku 4.5,
      JWT-protected): costruisce il contesto da **soli aggregati** — ultimo
      snapshot `conto_nav_giornaliero` (patrimonio totale + composizione),
      `tax_events` sommati per anno (ultimi 3), ed **esito di
      `calcola-budget-sostenibilita`** invocata internamente inoltrando lo
      stesso JWT della richiesta (nessuna duplicazione della logica di
      sostenibilità). Stesse regole di compliance di LMadvisory: mai
      raccomandazioni di investimento specifiche, ipotesi sempre etichettate
      come tali. **Richiede il secret `ANTHROPIC_API_KEY`** configurato su
      questo progetto Supabase (Edge Functions → Secrets) — non verificato
      dall'assistente, va controllato/impostato dall'utente. Frontend:
      `pages/chat.html` + `js/client/chat.js`, conversazione unica continua
      (riprende l'ultima esistente all'apertura, "Nuova conversazione" la
      azzera lato client).
- [x] **Proiezioni interattive** — `config_rendimenti_attesi` (migration
      `0029`): ipotesi di rendimento annuo per i 6 bucket di
      `conto_nav_giornaliero` (cash/stock/bonds/funds/commodities/crypto —
      `options` escluso, nessuna ipotesi di deriva di lungo periodo sensata
      per posizioni derivate), seed con medie storiche di mercato generiche
      (stock 7%, bonds 3%, funds 6%, commodities 4%, crypto 10%, cash 2%),
      liberamente modificabili, mai un consiglio su uno strumento specifico.
      Frontend puro client-side (nessuna nuova edge function: calcolo di
      crescita composta, nessun dato sensibile oltre a quanto già letto via
      RLS) — `pages/proiezioni.html` + `js/client/proiezioni.js`, grafico
      Chart.js 4.4.1 (stessa libreria/versione di LMadvisory). Default:
      valore iniziale + rendimento atteso (CAGR pesato sull'allocazione
      corrente, calcolato lato client) dall'ultimo snapshot
      `conto_nav_giornaliero`; contributo mensile = margine mensile da
      `calcola-budget-sostenibilita`; orizzonte 20 anni. Tutti i 4 parametri
      sono slider/input liberamente modificabili, ricalcolo istantaneo.
      **Nota**: l'ultimo snapshot `conto_nav_giornaliero` disponibile è del
      2025-12-31 — la proiezione parte da quel valore/quell'allocazione finché
      non arriva uno snapshot più recente (dipende dalla sincronizzazione
      IBKR di Fase 1, non affrontata in questa sessione).
- [x] **Rendimento per singolo strumento (raffinamento confermato
      dall'utente)** — `tax_instruments` estesa (migration `0030`) con
      `yahoo_ticker` (override manuale, stesso pattern di
      `etf_master.yahoo_ticker` in LMadvisory — qui non c'è una colonna
      "exchange" da cui generare un ticker, quindi il ticker Yahoo viene
      risolto per ISIN alla prima esecuzione e cachato, sovrascrivibile a
      mano in caso di collisione di simbolo, es. "GOLD" non è univoco),
      `rendimento_5y_pct`, `anni_dati_disponibili`, `rendimento_5y_calcolato_il`.
      Edge function `calcola-rendimenti-storici` (da rilanciare a mano, non un
      cron): risolve il ticker Yahoo per ISIN via l'endpoint di ricerca,
      scarica **un'unica volta** ~5 anni di prezzi settimanali (adjclose) e
      calcola il CAGR sulla **finestra più lunga disponibile tra 5/3/1 anni**
      (fallback a cascata esplicitamente richiesto dall'utente: se lo
      strumento non ha 5 anni di storico prova 3, poi 1 — le tre finestre
      sono sotto-intervalli dello stesso fetch, nessuna chiamata Yahoo
      aggiuntiva); sotto 1 anno di storico il calcolo viene scartato per
      bassa significatività. `anni_dati_disponibili` rende trasparente quale
      finestra è stata usata. Mai un dato fabbricato: dove la risoluzione o
      il fetch falliscono resta `NULL` e le proiezioni usano il fallback per
      categoria di `config_rendimenti_attesi`. `proiezioni.js` ora pesa il
      CAGR per
      **valore di posizione attuale** di ogni strumento (reale dove
      disponibile, fallback altrimenti) invece della sola categoria
      NAV-bucket; pulsante "Ricalcola rendimenti storici strumenti" nella
      pagina Proiezioni per lanciarlo (richiede login, non eseguito da
      questa sessione).
- [ ] **Verifica utente** — non testato in flusso autenticato reale (nessuna
      credenziale inserita dall'assistente, per policy): da controllare dopo
      login, in particolare:
      1. Che `ANTHROPIC_API_KEY` sia configurata e la chat risponda.
      2. Che i numeri di riepilogo mostrati alla chat corrispondano a quelli
         reali.
      3. **Tutti** i `tax_instruments.yahoo_ticker` risolti automaticamente da
         `calcola-rendimenti-storici` vanno verificati **uno per uno** dall'utente
         (rischio concreto di omonimia — es. "GOLD" non è univoco su Yahoo Finance):
         la colonna esiste già proprio per questo, sovrascrivibile a mano quando la
         risoluzione automatica ha scelto lo strumento sbagliato.
      4. ~~Che l'opzione "CAGR precalcolato dalle holdings attuali" sia
         testabile~~ — risolto: `ibkr-flex-pull` rilanciato con la query YTD
         IBKR (Period: Year to Date, stesso `flex_query_id` configurato),
         posizioni/NAV ora aggiornati al 2026-07-23 (672 righe NAV, 19
         posizioni aperte). Resta da rilanciare anche `calcola-lotti-fiscali`
         per allineare `tax_lots`/`tax_events` (Portafoglio/Fiscale) ai nuovi
         trade.
      5. Che il CAGR di default nelle proiezioni torni con un conto a mano dopo
         il ricalcolo.

## Fase 6 — LAYOUT FRONTEND (React + Tailwind) — in corso

Su richiesta esplicita dell'utente ("voglio un frontend super moderno"):
identità "Bold Mono" scelta dopo un giro di mockup comparativi (A-I,
incluse varianti bordeaux/mattone e blu su richiesta) — fondo grigio chiaro,
card patrimonio nera, accento verde lime, dashboard unica con drill-down,
parità desktop/mobile da subito.

- [x] **Scaffold** — nuovo progetto `web/` (Vite + React 18 + React Router +
      Tailwind), **non tocca il sito vanilla esistente** (stesso pattern
      strangler-fig del CRM di LMadvisory). Token di design in
      `tailwind.config.js` (colori/radius/font Bold Mono) — cambiare identità
      visiva in futuro è modificare quei valori, non i componenti.
- [x] **Dashboard** — patrimonio netto reale + sparkline, allocazione,
      card **Portafoglio** e **Utenze** in evidenza (costi fissi reali, non
      la sostenibilità — priorità confermata dall'utente), card **Budget**
      volutamente secondaria ("Extra"), teaser Proiezioni/Fiscale.
- [x] **Viste di dettaglio** — Portafoglio (holdings), Utenze (bollette +
      spese fisse reali), Budget (motore sostenibilità), Proiezioni
      (calcolatore interattivo con grafico SVG + pulsante ricalcolo
      rendimenti storici), Fiscale (quadri RT/RM/RW/RP), Chat — stessa
      logica di aggregazione client-side del sito vanilla, portata in
      componenti React.
- [x] **Deploy** — Vercel, team **madaprojects**, progetto `budgeting-web`:
      https://budgeting-web-madaprojects.vercel.app. **Deployment
      Protection di Vercel va disabilitata dall'utente** (Project Settings →
      Deployment Protection) — oggi blocca l'accesso normale perché l'app ha
      già il proprio login Supabase, la protezione Vercel è ridondante.
- [ ] **Sistemare i numeri** — l'utente ha confermato a voce che "certe cose
      non tornano" nella dashboard/viste reali; deciso esplicitamente di
      finalizzare prima tutte le funzionalità e sistemare i numeri in un
      passaggio dedicato successivo (non ancora fatto in questa sessione).

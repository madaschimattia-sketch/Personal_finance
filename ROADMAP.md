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
      **Resta un limite noto**: la riconciliazione copre solo le QUANTITÀ, non
      l'obbligo di monitoraggio RW riga per riga (ISIN/paese/valore per prodotto
      estero) — quello richiederebbe una vista/export dedicata da
      `posizioni_aperte_ibkr`, non ancora costruita.
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

## Frontend — rimandato di proposito

> Decisione esplicita dell'utente: nessun frontend finché il modello dati non è più
> maturo, per evitare di costruire viste su uno schema ancora in movimento e doverle
> poi rifare. Fino ad allora tutto (ingestione IBKR, motore lotti, quadro fiscale) resta
> verificato solo via SQL diretto/script offline — nessun login, nessuna pagina, niente
> da testare visivamente.
>
> Criterio per riconsiderare (non una data, un traguardo): la Fase 1 (motore fiscale)
> è il dominio con più probabilità di richiedere ancora modifiche strutturali allo
> schema (RM/RW/IVAFE/fondi pensione non ancora implementati, riconciliazione
> OpenPosition non modellata). Il momento naturale per iniziare il frontend è quando
> Fase 1 è **funzionalmente completa** (RT ✅, RM, RW, IVAFE e fondi pensione fatti) —
> a quel punto lo schema `tax_*`/`conti`/`movimenti` dovrebbe essere stabile abbastanza
> da non richiedere rework delle viste. Non è comunque necessario aspettare anche Fase
> 2/3 (UTENZE/INTROITI): sono domini indipendenti che possono aggiungersi in seguito
> senza toccare le viste già costruite per INVESTIMENTI.
> Nel frattempo, la necessità di un JWT reale (bloccante per invocare le edge function
> via HTTP, non solo via SQL diretto) resta un motivo pratico in più per non rimandare
> all'infinito: il primo pezzo di frontend, quando si parte, sarà comunque login+auth.

## Fase 2 — UTENZE (ingestione Drive → PDF → Claude)

Non iniziata. Pipeline separata da IBKR: parsing PDF via Claude API, non Flex Web Service.

## Fase 3 — INTROITI DA LAVORO

Non iniziata. Stessa pipeline Drive/Claude di UTENZE.

## Fase 4 — BUDGET

Dipende da INVESTIMENTI + UTENZE + INTROITI. Non iniziata.

## Fase 5 — ESPERTO DI FINANZA

Dipende da BUDGET. Non iniziata.

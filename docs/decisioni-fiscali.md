# Decisioni fiscali — Fase 1

> Decisioni prese esplicitamente (non assunzioni tecniche), con impatto diretto sullo
> schema. Vanno riviste se cambia la valutazione del commercialista o l'ambito del progetto.

## IVAFE su liquidità IBKR — regime FISSO

Decisione: la liquidità sui conti IBKR è trattata con il **regime fisso** (analogo al bollo
conto corrente), non con il regime proporzionale 0,2%.

- Parametri in `config_fiscale_parametri` (anno 2026, **`verificato = false`** — da confermare
  prima di ogni calcolo reale):
  - `ivafe_cash_fissa_eur` = 34.20
  - `ivafe_cash_soglia_giacenza_media_eur` = 5000
- Fonte del dato di giacenza media: vista `v_giacenza_media_cash_annua`, calcolata su
  `conto_nav_giornaliero.cash_eur` (popolata da `EquitySummaryByReportDateInBase` dell'XML
  Flex). Nota: la media è sui soli giorni di mercato presenti nel feed IBKR, non sui 365
  giorni di calendario — approssimazione accettata in Fase 1; se serve la media esatta
  calendario, il motore dovrà riempire i giorni non di mercato con l'ultimo saldo noto
  prima di aggregare.
- Il regime **proporzionale (0,2%)** resta comunque necessario per titoli/ETF/obbligazioni
  (quelli non sono "liquidità") — la decisione riguarda solo il sotto-insieme cash.

## Fondi pensione — italiani ed esteri, upload manuale

Decisione: entrambi i tipi rientrano in Fase 1, **nessuna pipeline automatica** (a differenza
di IBKR): versamenti e posizione periodica caricati a mano dall'utente, con documento di
supporto opzionale in `documenti_grezzi`.

- `fondi_pensione.is_estero` pilota il monitoraggio RW (i fondi esteri vanno monitorati come
  gli altri asset esteri; quelli italiani no).
- Dominio **separato** dal motore lotti IBKR: non passa da `tax_lots`/`tax_lot_closures`.
  La tassazione (deduzione contributi fino a 5.164,57 €/anno, imposta sostitutiva già
  trattenuta dal fondo sul rendimento, tassazione in uscita 15%→9%) è un calcolo a parte,
  ancora da progettare (fuori dallo scope di questa migration).
- Tabelle: `fondi_pensione` (anagrafica + `intestatario_id`), `fondo_pensione_versamenti`
  (per anno di competenza, ai fini del tetto deduzione), `fondo_pensione_posizione`
  (snapshot controvalore).

## Parametri di legge — mai hardcoded

Aliquote, soglie e importi fissi (capital gain 26%, whitelist 12,5%, IVAFE, carryforward
4 anni) vivono in `config_fiscale_parametri` (per anno), non nel codice. Il flag
`verificato` è `false` di default sui valori seed: sono riferimenti storicamente noti,
**non un'asserzione che siano quelli in vigore per l'anno fiscale corrente** — vanno
confermati prima di qualunque calcolo reale.

Stessa logica per `tax_paesi_whitelist` (elenco paesi i cui titoli di stato godono
dell'aliquota agevolata, chiave `issuerCountryCode` da `SecurityInfo`, non `issuer` — spesso
vuoto) e per `tax_instruments.classificazione_confermata` (le classificazioni whitelist/OICR
derivabili dall'XML sono un suggerimento automatico, non una certificazione fiscale: restano
`null`/`false` finché non revisionate a mano).

## Whitelist 12,5% — fonte e stato (migration `0008`)

Decisione: `tax_paesi_whitelist` è popolata dal testo **integrale** del Decreto Min. Finanze
4 settembre 1996 (testo consolidato con le modifiche del Decreto 23/03/2017, in vigore dal
03/04/2017), fornito dall'utente come PDF ufficiale — non dal D.Lgs 239/1996 stesso, che è
solo la legge abilitante (art. 11 c.4 lett. c) e **non contiene l'elenco** (equivoco iniziale
chiarito in sessione: il primo PDF caricato era la legge delega, non il decreto attuativo).

- 134 righe, tutte `attivo=true` e **`verificato=true`** (fonte primaria, non più un seed
  provvisorio come i 2 paesi iniziali FR/US).
- `paese_codice` = ISO 3166-1 alpha-2, per matching diretto con
  `tax_instruments.issuer_country_code` (IBKR `issuerCountryCode`). Eccezione: **Alderney** e
  **Herm**, elencate separatamente nel decreto ma dipendenze della Bailiwick of Guernsey senza
  codice ISO 3166-1 proprio — inserite con codice non-ISO puramente descrittivo (`GG-ALD`,
  `GG-HERM`); operativamente ininfluenti perché IBKR riporterà sempre `GG` per un emittente lì
  domiciliato.
- L'art. 1-bis del decreto stesso prevede rimozioni successive per singoli Stati/territori
  (violazioni reiterate degli obblighi di cooperazione, via decreto separato ex art. 11 c.5
  D.Lgs 239/1996): questo elenco è lo snapshot fornito in sessione, **non un feed
  auto-aggiornante** — da ri-verificare se compaiono titoli di stato di paesi non presenti qui
  o se il commercialista segnala un aggiornamento del decreto.
- Backfill immediato: `tax_instruments` per l'OAT francese e il T-bond USA (gli unici titoli
  di stato nei dati reali) aggiornati a `is_titolo_stato_whitelist=true`, `is_oicr=false`,
  `classificazione_confermata=true` (nessuna chiusura esistente su questi due strumenti, quindi
  nessun impatto retroattivo su annualità già dichiarate — verificato prima di scrivere).

## Classificazione OICR/non-OICR — tutti gli strumenti (migration `0010`)

Decisione: `subCategory='ETF'` di IBKR **non distingue** un fondo vero (OICR, UCITS
armonizzato) da un ETC (Exchange Traded Commodity — nota di debito fisicamente garantita,
NON un organismo di investimento collettivo). Questa distinzione cambia il trattamento
fiscale (le minus da OICR non compensano nulla; le minus da un ETC, essendo "redditi
diversi" ordinari, sì) — non era automatizzabile dal solo dato IBKR, serviva una verifica
per prodotto.

- **Verificato via web search** (non solo inferenza dal nome): WisdomTree Physical Bitcoin
  (WBTC) → "UCITS Eligible: sì, UCITS Compliant: NO", forma legale "Debt Security/ETP",
  domicilio Jersey; Amundi Physical Gold ETC (GOLD) → struttura ETC, "eligible for
  investment in UCITS schemes" (non è esso stesso un UCITS); Amundi S&P 500 VIX Futures
  Enhanced Roll (LVO) → confermato "UCITS compliant exchange traded fund"; Xtrackers MSCI
  EM (XMME) → confermato fondo UCITS standard; Carlyle Secured Lending (CGBD) → BDC USA
  quotata NASDAQ, gestita da adviser SEC-registered, **non** un veicolo UE/whitelist.
- **Esteso per pattern** (stessa famiglia emittente/struttura, non verificato singolarmente):
  SLVRP/COPAl (stessa famiglia WisdomTree Physical di WBTC) → non-OICR; gli altri 13 fondi
  UCITS di iShares/Amundi/Xtrackers/VanEck/Vanguard/SPDR/Invesco (domicilio IE/LU/NL/FR) →
  OICR, per lo stesso pattern verificato su LVO/XMME.
- Risultato: 10 strumenti non-OICR (4 azioni USA, 1 ADR, 1 BDC, 1 opzione, 4 ETC fisici su
  commodity/cripto), 15 OICR (fondi UCITS), 2 titoli di stato whitelist (già fatti in
  `0008`) — **tutti i 27 strumenti ora `classificazione_confermata=true`**.
- `tax_lot_closures.categoria_compensazione` ricalcolato con un semplice `UPDATE ... FROM`
  che deriva la categoria dalla classificazione dello strumento (non serve rieseguire il
  motore lotti: la categoria non dipende dalle quantità/importi della chiusura, solo dallo
  strumento) — nessun impatto su quantità/importi già registrati, quindi sicuro anche per
  le chiusure di anni congelati (2023/2024).
- **Punto aperto per il commercialista**: la reale compensabilità delle minusvalenze da
  OICR "armonizzati" (UCITS) con altre categorie di redditi diversi, dopo l'unificazione del
  regime fiscale (D.L. 138/2011, in vigore dal 2012), è un tema di diritto tributario non
  banale che questo progetto non ridiscute — segue la separazione già incorporata nello
  schema prima di questa sessione (categoria `oicr_non_compensabile` a sé, nessun riporto).
  Se il commercialista conferma che le minus OICR post-2012 sono in realtà compensabili con
  le altre categorie di redditi diversi, `tax_loss_carryforward.categoria` e la logica di
  `quadro-rt.ts` andranno estesi di conseguenza.

## Quadro RT — aggregazione redditi diversi di natura finanziaria (art. 67/68 TUIR)

Decisione (priorità scelta dall'utente tra RT/RM/RW: si parte da RT perché deriva
direttamente da `tax_lot_closures`, appena validato). Modulo puro
`supabase/functions/_shared/quadro-rt.ts` + edge function `calcola-quadro-rt`
(JWT-protected, aggregazione per **utente** su tutti i conti — la dichiarazione è unica,
a differenza del motore lotti che lavora per conto).

- Compensazione **solo entro la stessa `categoria_compensazione`**: 'ordinaria' (26%) e
  'whitelist' (12,5%) nettano plus/minus dell'anno; se il saldo è positivo, consumano prima
  le minusvalenze pregresse riportabili (`tax_loss_carryforward`, FIFO per `anno_origine`
  così si usano quelle più vicine alla scadenza dei 4 anni) prima di calcolare l'imponibile;
  se negativo, generano un nuovo riporto. 'oicr_non_compensabile': le plusvalenze sono
  sempre imponibili in pieno (nessuna compensazione, né corrente né pregressa); le
  minusvalenze non generano alcun riporto (nessuna riga `tax_loss_carryforward`, coerente
  con lo schema che ammette solo categoria 'ordinaria'/'whitelist' — vedi il punto aperto
  sopra).
- Chiusure con `categoria_compensazione IS NULL` (strumento non ancora confermato) sono
  **escluse** dal calcolo e riportate a parte (`chiusure_non_classificate`): non si include
  mai nel quadro un dato non confermato.
- **Sicurezza anni già dichiarati**: rifiuta di calcolare/scrivere per un anno con
  `dichiarazioni_fiscali.stato='presentata'` — il quadro RT di un anno già presentato non
  viene mai ricalcolato da questa function.
- `config_fiscale_parametri` seminato anche per il 2025 (migration `0009`, stessi valori del
  2026, `verificato=false` — le aliquote 26%/12,5% sono stabili da anni ma non è
  un'asserzione di correttezza senza conferma).
- **Calcolato per il 2025** (via SQL diretto, stesso limite JWT delle altre edge function):
  17 chiusure, tutte plusvalenze (nessuna minus, quindi nessun riporto creato/consumato) —
  plusvalenza ordinaria imponibile 3.952,21 € (imposta 1.027,57 €), provento OICR imponibile
  31,34 € (imposta 8,15 €, aliquota ordinaria in assenza di fondi OICR su titoli di stato
  whitelist nel portafoglio). Imposta RT 2025 totale stimata: **1.035,72 €**. Nessuna
  minusvalenza pregressa da anni precedenti nel sistema (2023/2024 non ricalcolati per RT,
  essendo `presentata` — se l'utente ha minusvalenze residue dalle dichiarazioni reali
  2023/2024 da riportare al 2025, vanno seminate a mano in `tax_loss_carryforward` prima di
  considerare definitivo il numero sopra).

## Opzioni: esercizio/assegnazione vs scadenza — casistiche separate

Decisione (a valle del chiarimento dell'utente: "gestire le due casistiche separatamente in
base agli impatti fiscali che hanno e a come impattano le performance del sottostante"):

- **Scadenza worthless (`expiration`)**: nessun impatto sul sottostante, il premio è un
  reddito/perdita "diverso" autonomo. Trattato dal motore lotti come chiusura standalone
  ordinaria (comportamento già corretto, verificato sul caso reale OKLO nel backfill).
- **Esercizio/assegnazione (`exercise`/`assignment`)**: il premio dell'opzione dovrebbe
  incorporarsi nel costo di carico (per una call esercitata) o nel ricavo di vendita (per una
  put esercitata / call assegnata) del **lotto del sottostante**, non generare una chiusura
  fiscale autonoma sull'opzione — impatta quindi sia il calcolo fiscale sia il rendimento
  registrato del sottostante. **Non automatizzato**: nessun caso reale di
  exercise/assignment esiste ancora nei dati (solo l'OKLO expiration), quindi non c'è nulla
  su cui validare la logica di redistribuzione del premio. Il motore (`lot-matching.ts`)
  calcola comunque una chiusura standalone come oggi (fallback, probabilmente impreciso) ma la
  segnala in `anomalie` con `tipo: 'esercizio_assegnazione_non_gestito'`, cosi' il numero non
  viene mai trattato come affidabile senza revisione manuale. Da implementare per davvero alla
  prima occorrenza reale.
- Wiring: `ibkr-flex-pull` legge `OptionEAE.transactionType` (via `mapOptionEventiPerTradeId`)
  e lo scrive su `tax_movements.evento_opzione` per il trade di chiusura corrispondente
  (match su `tradeID`); `tax_instruments.underlying_conid/isin/symbol` collega opzione e
  sottostante (solo informativo, per ora — non ancora usato dal motore).

## Sicurezza anni già dichiarati (migration `0006`, motore in `calcola-lotti-fiscali`)

Decisione: `dichiarazioni_fiscali.stato='presentata'` rende un anno **immutabile** per il
motore lotti — non un dettaglio tecnico ma un vincolo esplicito dell'utente ("le dichiarazioni
del 2023 e del 2024 sono già state presentate, quindi da archiviare"; 2025 da preparare/validare
ora; 2026 parziale perché l'anno non è concluso). Seed coerente in `0006`: 2023 e 2024
`presentata`, 2025 `in_preparazione`, 2026 `non_iniziata`.

Meccanismo (non un semplice flag di sola-lettura, ma un confronto attivo): il motore resta
full-recompute in memoria, ma riusa gli **id lotto esistenti** (chiave `acquisto_movement_id`)
così le chiusure ricalcolate sono confrontabili 1:1 con quelle già in DB via
`(lot_id, vendita_movement_id)`. Per ogni strumento, se una chiusura ricalcolata che cade in un
anno bloccato diverge (o manca, o è sparita) rispetto a quanto già registrato, **l'intero
strumento viene saltato** (nessuna scrittura, divergenza riportata in
`strumenti_saltati_per_divergenza`) — non si sovrascrive mai un anno dichiarato senza controllo
umano. Validato offline (nessun JWT ancora disponibile per invocare la edge function via HTTP):
tutte le 29 chiusure 2023/2024 esistenti coincidono esattamente col ricalcolo, zero divergenze.

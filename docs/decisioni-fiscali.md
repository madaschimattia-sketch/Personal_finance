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

## Quadro RM Sezione V — redditi di capitale di fonte estera (art. 44/45 TUIR)

Decisione: dividendi, interessi (cassa) e cedole obbligazionarie percepiti via IBKR vanno
autoliquidati dall'utente nel quadro RM Sezione V, perché **IBKR non è un sostituto
d'imposta italiano** — a differenza di un intermediario italiano, non applica lui stesso
l'imposta sostitutiva alla fonte. Modulo puro `supabase/functions/_shared/quadro-rm.ts` +
edge function `calcola-quadro-rm` (JWT-protected, per utente su tutti i conti, come RT).

- **Nessuna compensazione** (a differenza di RT): ogni provento è imponibile per intero,
  non ci sono minusvalenze né riporti in RM. L'unica riduzione è il **credito d'imposta**
  per le ritenute subite alla fonte estera (`tax_movements.tipo='ritenuta'`).
- Distinzione whitelist/ordinaria **solo per le cedole di titoli di stato whitelist**
  (12,5% invece di 26%) — i proventi da OICR (dividendi/distribuzioni di fondi UCITS) non
  hanno un trattamento speciale in RM: sono redditi di capitale come qualunque altro
  dividendo, aliquota ordinaria. La distinzione OICR/non-OICR di `quadro-rt.ts` **non**
  si applica qui (riguarda solo la compensabilità delle minus in RT, non la tassazione dei
  proventi periodici).
- Matching ritenuta↔provento **per categoria/anno aggregato, non riga per riga**:
  `tax_movements` non ha un FK esplicito dalla ritenuta al provento che l'ha generata (sono
  due `CashTransaction` separate nello stesso giorno nell'XML IBKR). Il credito d'imposta è
  quindi calcolato come pool aggregato per categoria, non un abbinamento 1:1 verificabile.
- Credito d'imposta **limitato al minore tra ritenuta subita e imposta italiana lorda
  sulla stessa categoria** (scelta prudente, non un'asserzione di diritto tributario): se
  la ritenuta eccede l'imposta lorda dovuta, l'eccedenza non viene utilizzata né
  considerata rimborsabile/riportabile da questo calcolo — segnalata nell'evento per
  verifica del commercialista. Nei dati reali 2025 non si è mai verificato (le ritenute,
  tutte al 15% da trattato USA-Italia su dividendi NVDA/CGBD/TDIV, sono sempre ben al di
  sotto del 26% italiano).
- Stessa sicurezza anni già dichiarati di RT (rifiuta di scrivere se
  `dichiarazioni_fiscali.stato='presentata'`).
- **Calcolato per il 2025**: reddito ordinario (dividendi + interessi cassa) imponibile
  817,75 € (imposta lorda 212,62 €, credito d'imposta estero 82,49 €, imposta netta
  130,12 €); cedole whitelist (OAT + T-bond) imponibile 188,95 € (imposta 23,62 €, nessuna
  ritenuta — coerente: interessi su titoli di stato USA/Francia non hanno subito
  withholding, trattato applicato correttamente da IBKR a monte). **Imposta RM 2025 totale
  stimata: 153,74 €**.

## Riconciliazione OpenPosition — 2 bug reali scoperti e corretti

Contesto: costruendo la riconciliazione (confronto tra `tax_lots` calcolati e lo snapshot
`OpenPosition` di IBKR a fine periodo) sono emersi due problemi strutturali pre-esistenti,
non ipotetici — hanno causato perdita silenziosa di dati reali nel backfill 2023-2025.

### Bug 1 — collisione transactionID Trade/CashTransaction (migration `0011`, `0012`, `0013`)

IBKR riusa lo **stesso `transactionID`** sia per il `Trade` di vendita di un'obbligazione
sia per la `CashTransaction` "Bond Interest Received" collegata (il rateo di accrued
interest liquidato al momento della vendita, quando questa avviene tra due cedole). La
chiave naturale usata finora, `(conto_id, ibkr_transaction_id)`, non distingue i due:
durante l'upsert di `ibkr-flex-pull` (Trade processati prima, CashTransaction dopo nello
stesso loop) la seconda scrittura sovrascriveva silenziosamente la prima, facendo
sparire la vendita dai nostri dati pur avendola effettivamente eseguita.

- Scoperto perché **T-bond USA** (venduto per intero il 2025-09-30, 4.000 unità) e
  **OAT francese** (4 vendite: -9.000 il 2024-11-07, -6.000/-10.000/-4.000 il
  2025-05-19) risultavano ancora "aperti" nei nostri `tax_lots` con quantità molto
  superiori a quelle reali riportate da `OpenPosition` IBKR al 31/12/2025 (45.000 vs
  16.000 per l'OAT, l'intera posizione vs 0 per il T-bond).
- Fix strutturale: indice unique esteso da `(conto_id, ibkr_transaction_id)` a
  `(conto_id, ibkr_transaction_id, tipo)` su `movimenti` e `tax_movements` — `tipo`
  disambigua perché un Trade e la sua CashTransaction collegata hanno sempre `tipo`
  diverso (`trade` vs `dividendo`/`interessi`/`cedola`/...). Anche il lookup
  `movimento_id` in `ibkr-flex-pull` (usato per collegare `tax_movements` alla riga
  `movimenti` gemella) è stato corretto per usare la stessa chiave composta
  `(transactionID, movimento.tipo)`, non solo `transactionID` — altrimenti la stessa
  ambiguità si sarebbe ripresentata a ogni pull futuro.
- Le 4 vendite OAT mancanti sono state recuperate dai file XML originali (ancora
  disponibili in locale) e reinserite (migration `0012`), poi ricalcolato manualmente
  il LIFO per l'intero strumento (migration `0013` — vedi anche il bug 2 sotto). La
  vendita del 2024-11-07 cade in un anno **già dichiarato**: corretto solo il ledger
  sottostante (`movimenti`/`tax_movements`/`tax_lots`/`tax_lot_closures`), **nessun
  `tax_events` toccato per il 2024** (RT/RM/RW non vengono mai calcolati per un anno
  con `dichiarazioni_fiscali.stato='presentata'` da questo sistema — e la
  dichiarazione 2024 effettivamente presentata dall'utente è stata preparata sui
  propri estratti conto IBKR, non con questo strumento, quindi presumibilmente già
  corretta di suo: qui si allinea solo la nostra base dati storica).
- Validazione indipendente: il plus/minus ricalcolato per la chiusura del 2024-11-07
  (-59,85 €) coincide **esattamente** con il `fifoPnlRealized` che IBKR stesso riporta
  per quel trade nell'XML originale — buona conferma che la metodologia (costo/ricavo
  a prezzo pulito, cedole maturate escluse e tassate a parte come reddito di
  capitale) sia corretta.

### Bug 2 — tie-break non cronologico nel motore lotti per movimenti stesso giorno

Ricalcolando manualmente l'OAT è emerso un secondo problema, questa volta nel motore
lotti stesso: `tax_movements.data` ha solo granularità di giorno (nessun orario), e il
vecchio ordinamento `lot-matching.ts` usava l'`id` (UUID casuale) come tie-break tra
movimenti della stessa data. Il 2025-05-19 l'OAT ha avuto 3 vendite (04:42-04:42
nell'XML originale) **seguite** da un acquisto (05:24, stesso giorno): il tie-break per
id avrebbe potuto (a seconda dell'ordine alfabetico degli UUID coinvolti) allocare una
vendita sull'acquisto dello stesso giorno eseguito DOPO — economicamente scorretto,
perché quelle unità non erano ancora possedute al momento della vendita.

- Fix: tie-break a parità di data ora mette sempre `vendita` prima di `acquisto`
  (`lot-matching.ts`, deployato `calcola-lotti-fiscali` v3) — scelta prudente in
  assenza di un vero timestamp: tratta ogni "vendo e poi reinvesto lo stesso giorno"
  nel modo più comune, evitando di usare fondi non ancora disponibili all'atto della
  vendita.
- Verificato a mano (script Node offline) che il ricalcolo con l'ordine cronologico
  reale (vendite prima dell'acquisto) dà: lotto 2024-11-12 (8.000 unità) mai toccato,
  lotto 2025-01-08 e lotto 2025-03-06 chiusi dalle 3 vendite, nuovo lotto 2025-05-19
  (l'acquisto) aperto — risultato: 8.000 + 8.000 = 16.000 unità aperte a fine anno,
  che coincide esattamente con `OpenPosition` IBKR.

### Esito della riconciliazione

Dopo i due fix: **18/18 strumenti concordanti, zero divergenze** tra `tax_lots` e
`posizioni_aperte_ibkr` al 31/12/2025 (edge function `calcola-riconciliazione-posizioni`,
verificato via query diretta in attesa di un JWT per l'invocazione HTTP reale).

Impatto sul quadro RT 2025: imposta totale **invariata** (1.035,72 €, le minusvalenze
whitelist non compensano nulla nell'anno stesso, solo riporto) ma il riporto
minusvalenze whitelist ora è corretto a **600,90 €** (497,16 € dalle vendite OAT +
103,74 € dalla vendita T-bond, prima mancanti) invece dei 103,74 € provvisori
calcolati prima di scoprire il secondo bug. RM e RW non sono impattati (le cedole
erano già registrate correttamente; il NAV aggregato di `conto_nav_giornaliero`,
fonte di RW, viene da una sezione XML diversa e non soggetta allo stesso bug).

**Limite noto rimasto**: la riconciliazione copre solo le *quantità* aperte per
strumento, non l'obbligo di monitoraggio RW riga per riga (ISIN/paese/valore per ogni
prodotto estero) richiesto dal quadro RW — quello richiederebbe una vista/export
dedicata da `posizioni_aperte_ibkr`, non ancora costruita.

## Quadro RW — IVAFE (art. 19 D.L. 201/2011)

Decisione di scope: il quadro RW ha due obblighi distinti — (1) il **monitoraggio
fiscale/valutario** (elenco riga per riga di ogni prodotto estero, con ISIN/paese/valore a
inizio e fine periodo di detenzione) e (2) l'**IVAFE**, l'imposta vera e propria sul valore
delle attività finanziarie estere. Qui si implementa **solo l'IVAFE**: il monitoraggio di
dettaglio richiederebbe lo snapshot posizioni di fine anno per singolo strumento
(`OpenPosition` di IBKR Flex), non ancora ingerito in questo progetto (stesso gap già
segnalato in ROADMAP per la riconciliazione lotti). Modulo puro
`supabase/functions/_shared/quadro-rw.ts` + edge function `calcola-quadro-rw`
(JWT-protected, **per conto** — a differenza di RT/RM, qui ogni conto estero è l'unità
naturale di monitoraggio, `tax_events.conto_id` valorizzato invece di `null`).

- **Componente cash** (regime fisso, decisione già presa altrove in questo documento):
  se la giacenza media annua (`v_giacenza_media_cash_annua`) supera la soglia
  (`ivafe_cash_soglia_giacenza_media_eur`), si applica l'importo fisso
  (`ivafe_cash_fissa_eur`), **non prorato** per giorni di possesso nell'anno — assunzione
  (il regime fisso è concepito come un bollo forfettario annuo, non un'imposta
  proporzionale al tempo), da confermare col commercialista se il conto viene aperto o
  chiuso a metà anno.
- **Componente titoli** (azioni/obbligazioni/ETF/opzioni/tutto il non-cash): regime
  proporzionale 2 per mille (0,2%) sul valore all'**ultima data disponibile nell'anno**
  in `conto_nav_giornaliero` (idealmente 31/12), **prorato per giorni di possesso**
  nell'anno (art. 19 comma 18 D.L. 201/2011) — calcolato come giorni tra
  `max(1 gennaio anno, prima data mai osservata per il conto)` e l'ultima data
  disponibile nell'anno, su 365/366 giorni totali.
- **Limite noto**: usare "ultima data disponibile nell'anno" come proxy di "data di
  chiusura conto" è un'approssimazione basata sui dati — non distingue un conto
  effettivamente chiuso a metà anno da un conto per cui semplicemente non abbiamo ancora
  ingerito i dati fino al 31/12. Per il 2025 non è un problema (dati completi fino al
  31/12), ma va tenuto a mente se in futuro un conto viene davvero chiuso in corso d'anno.
- **Calcolato per il 2025**: giacenza media cash 2.333,42 € (sotto soglia 5.000 €) → nessuna
  IVAFE fissa; titoli 96.813,73 € al 31/12/2025 (92.859,33 € azioni/ETF + 3.954,40 €
  obbligazioni), 365/365 giorni di possesso (conto aperto da fine 2023, quindi tutto
  l'anno) → IVAFE proporzionale 193,63 €. **Imposta RW 2025 totale: 193,63 €**.

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

## Fondi pensione — scope limitato alla deduzione versamenti (quadro RP)

Decisione di scope, non dimenticanza: il dominio fondi pensione (D.Lgs 252/2005) ha tre
componenti fiscali distinte, ma solo la prima è stata implementata.

- **Deduzione versamenti** (quadro RP, art. 10 c.1 lett. e-bis TUIR) — **implementata**:
  modulo `fondo-pensione.ts` + edge function `calcola-fondo-pensione`. Somma i versamenti
  `deducibile=true` per `anno_competenza`, applica il tetto 5.164,57 €/anno
  (`config_fiscale_parametri`), riporta l'eccedenza eventuale. `tax_events.quadro` esteso
  con `'RP'` (migration `0014`) — `aliquota_pct` sempre `null` e `imposta_eur` sempre `0`:
  una deduzione riduce la base imponibile IRPEF all'aliquota marginale della persona, che
  non è modellata in questo progetto (servirebbe l'intera dichiarazione, non solo la
  previdenza complementare) — l'evento riporta solo l'importo dedotto, non un risparmio
  d'imposta calcolato.
- **Imposta sostitutiva sul rendimento** — **non implementata, per design**: è già
  trattenuta dal fondo stesso (obbligo dell'ente gestore, non dell'aderente), quindi non
  richiede alcun calcolo o adempimento da parte nostra.
- **Tassazione in uscita** (riscatto/rendita, aliquota 15%→9% in base agli anni di
  iscrizione, art. 11 c.6 D.Lgs 252/2005) — funzione pura `aliquotaTassazioneUscita`
  implementata e pronta all'uso, ma **non collegata a nessuna edge function**: è rilevante
  solo al momento di un riscatto/rendita effettivo, e nessun fondo in questo progetto è
  arrivato a quel punto (anzi, nessun fondo è ancora stato registrato — vedi sotto).
- L'**eccedenza non deducibile** (versamenti oltre il tetto) viene calcolata e riportata
  nella nota dell'evento perché fiscalmente rilevante in futuro (è esente da tassazione al
  riscatto, art. 11 D.Lgs 252/2005) — ma non esiste ancora una tabella dedicata al suo
  cumulo pluriennale: costruirla ora, senza nessun dato reale di riferimento, avrebbe
  significato indovinare uno schema piuttosto che progettarlo sui dati reali.
- **Stato dei dati**: `fondi_pensione`, `fondo_pensione_versamenti` e
  `fondo_pensione_posizione` sono **tutte vuote** — l'utente non ha ancora registrato
  nessun fondo pensione in questo sistema. Il motore è stato validato solo con dati
  sintetici offline (tetto rispettato, eccedenza corretta, aliquota di uscita corretta ai
  limiti noti 15/35 anni). Andrà rivalidato contro un caso reale alla prima registrazione.

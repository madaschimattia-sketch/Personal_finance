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

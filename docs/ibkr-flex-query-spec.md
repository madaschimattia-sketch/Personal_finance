# IBKR Flex Query — riferimento campi (derivato da XML reale)

> Mappa **autorevole** delle sezioni della Activity Flex Query e dei loro attributi,
> ricavata da un XML di esempio reale (1 conto, `U13283246`). È il riferimento per
> l'edge function `ibkr-flex-pull` e per lo schema normalizzato. Se un domani IBKR
> aggiunge/rinomina campi, **vince l'XML**: aggiornare qui.

## Modello di pull

- **Una Flex Query per conto** → un `QueryId` per ciascuno dei ~15 conti IBKR.
  Il `token` del Flex Web Service è **unico** (secret `IBKR_FLEX_TOKEN`), varia solo il `QueryId`.
- Il pull è **asincrono a due passi**:
  1. `GET .../FlexStatementService.SendRequest?t=<token>&q=<QueryId>&v=3`
     → `<FlexStatementResponse><Status>Success</Status><ReferenceCode>…</ReferenceCode><Url>…</Url>`
  2. `GET <Url>?t=<token>&q=<ReferenceCode>&v=3`
     → l'XML, **oppure** `<Status>Warn</Status><ErrorCode>1019</ErrorCode>` (“statement generation in progress”)
     → **retry con backoff** (tipicamente 2–5 tentativi, ~5s l'uno).
- Codici d'errore noti: `1003` token non valido, `1018` troppe richieste, `1019` in generazione,
  `1021` reference code scaduto. Vanno gestiti distintamente.

## Struttura XML

```
FlexQueryResponse
└── FlexStatements                     (@count)
    └── FlexStatement                  (@accountId @fromDate @toDate @period @whenGenerated)  ← 1 per conto
        ├── EquitySummaryInBase
        │   └── EquitySummaryByReportDateInBase   NAV giornaliero per asset class (262 righe/anno)
        ├── OpenPositions
        │   └── OpenPosition                       posizioni aperte a fine periodo
        ├── Trades
        │   └── Trade                              eseguiti (STK / BOND / CASH=forex)
        ├── OptionEAE                              exercise/assignment/expiration opzioni (vuoto nel campione)
        ├── CorporateActions                       (vuoto nel campione)
        ├── CashTransactions
        │   └── CashTransaction                    dividendi, ritenute, interessi, versamenti/prelievi
        ├── InterestAccruals
        │   └── InterestAccrualsCurrency           ratei interessi per valuta
        ├── Transfers
        │   └── Transfer                           trasferimenti (cash/titoli) in/out; include cashTransfer
        └── SecuritiesInfo
            └── SecurityInfo                        anagrafica strumenti (issuerCountryCode → whitelist)
```

## Formati

- **Date**: `yyyyMMdd` (es. `20250704`). `dateTime` = `yyyyMMdd;HHmmss` (es. `20250704;043248`).
- **Numeri**: decimali con `.`, segno `-` per uscite. Convertibili direttamente a `numeric`.
- **Valuta/FX**: ogni riga ha `currency` + `fxRateToBase` (EUR per 1 unità di valuta al momento).
  `fxRateToBase="1"` per EUR. **Coerente con la convenzione: importi normalizzati in valuta base alla scrittura.**

## Chiavi naturali (idempotenza)

Ogni pull ri-scarica lo stesso periodo → l'upsert normalizzato deve deduplicare su chiavi IBKR stabili:

| Sezione | Chiave naturale | Note |
|---|---|---|
| Trade | `(ibkr_account_id, tradeID)` | `transactionID` alt.; `tradeID` stabile per eseguito |
| CashTransaction | `(ibkr_account_id, transactionID)` | `actionID` per corporate-linked |
| Transfer | `(ibkr_account_id, transactionID)` | |
| OpenPosition | `(ibkr_account_id, conid, reportDate)` | snapshot, non evento |
| EquitySummary… | `(ibkr_account_id, reportDate)` | snapshot NAV giornaliero |
| SecurityInfo | `(conid)` / `(isin)` | anagrafica, upsert |

## Campi per sezione (attributi reali osservati)

### FlexStatement (header conto)
`accountId` · `fromDate` · `toDate` · `period` · `whenGenerated`

### Trade  — assetCategory osservati: `STK`, `BOND`, `CASH` (forex)
Identità: `accountId` `tradeID` `transactionID` `conid` `isin` `symbol` `description` `securityID` `cusip` `figi` `listingExchange`
Classificazione: `assetCategory` `subCategory` `buySell` (BUY/SELL) `openCloseIndicator` (O/C) `issuer` `issuerCountryCode` `multiplier` `putCall` `strike` `expiry`
Date: `tradeDate` `dateTime` `reportDate` `settleDateTarget`
Valori: `currency` `fxRateToBase` `quantity` `tradePrice` `tradeMoney` `proceeds` `ibCommission` `ibCommissionCurrency` `taxes` `netCash` `cost` `closePrice` `fifoPnlRealized` `mtmPnl`
Opzioni/collegamenti: `underlyingConid` `underlyingSymbol` `relatedTradeID` `origTradeID` `ibOrderID` `ibExecID` `notes`

### CashTransaction — type osservati: `Dividends`, `Withholding Tax`, `Bond Interest Received`, `Bond Interest Paid`, `Broker Interest Received`, `Deposits/Withdrawals`
Identità: `accountId` `transactionID` `conid` `isin` `symbol` `description` `issuer` `issuerCountryCode`
Classificazione: `type` `dividendType` `code` `actionID` `tradeID`
Date: `dateTime` `settleDate` `reportDate` `exDate` `availableForTradingDate`
Valori: `currency` `fxRateToBase` `amount`

> **Mappatura fiscale/cassa dei `type`:**
> - `Dividends` → provento (dividendo). `Withholding Tax` → ritenuta collegata (amount negativo).
> - `Bond Interest Received` → cedola. `Bond Interest Paid` → rateo pagato all'acquisto (negativo).
> - `Broker Interest Received` → interessi su liquidità.
> - `Deposits/Withdrawals` → **flusso di cassa esterno** (versamento/prelievo), non reddito.

### Transfer — type `INTERNAL`, direction `IN`/`OUT`
`accountId` `transactionID` `assetCategory` `symbol` `isin` `conid` `type` `direction` `date` `dateTime` `settleDate` `quantity` `transferPrice` `cost` `cashTransfer` `positionAmount` `positionAmountInBase` `pnlAmount` `account` `deliveringBroker` `code`

> `cashTransfer` valorizzato (es. `45000`) = **versamento/prelievo via giroconto** → confluisce nella cassa
> insieme a `CashTransaction Deposits/Withdrawals`. I trasferimenti di **titoli** (quantity/isin) portano
> `cost`/`openDateTime` → rilevano per il costo fiscale del lotto trasferito.

### OpenPosition (snapshot fine periodo)
`accountId` `conid` `isin` `symbol` `assetCategory` `reportDate` `position` `markPrice` `positionValue` `openPrice` `costBasisPrice` `costBasisMoney` `percentOfNAV` `fifoPnlUnrealized` `side` `openDateTime` `holdingPeriodDateTime` `currency` `fxRateToBase` `accruedInt`

### SecurityInfo (anagrafica strumenti)
`conid` `isin` `cusip` `figi` `symbol` `description` `currency` `assetCategory` `subCategory` `issuer` **`issuerCountryCode`** `multiplier` `strike` `expiry` `putCall` `maturity` `issueDate` `underlyingConid` `underlyingCategory` `settlementPolicyMethod`

> `issuerCountryCode` (osservati: FR, IE, JE, LU, NL, US) è la base della **whitelist titoli di stato 12,5%**
> — non `issuer` (spesso vuoto). La whitelist va valutata su questo campo + `assetCategory=BOND` + tipo emittente.

### InterestAccrualsCurrency (ratei per valuta)
`accountId` `currency` `fromDate` `toDate` `startingAccrualBalance` `interestAccrued` `accrualReversal` `fxTranslation` `endingAccrualBalance`

### EquitySummaryByReportDateInBase (NAV giornaliero per asset class)
`accountId` `reportDate` `currency` `cash` `stock` `bonds` `options` `funds` `commodities` `crypto` `dividendAccruals` `interestAccruals` … `total` (+ varianti `*Long`/`*Short`). Copre la **performance** giornaliera per asset class.

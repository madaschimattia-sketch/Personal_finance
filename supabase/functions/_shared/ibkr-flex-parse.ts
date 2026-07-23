// Parsing dell'XML Flex in strutture normalizzate. Mappa dei campi in
// docs/ibkr-flex-query-spec.md (fonte autorevole, derivata da XML reale).
import { XMLParser } from "npm:fast-xml-parser@4";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// "20250704" -> "2025-07-04". dateTime porta anche l'ora dopo ';', qui non serve.
function ibkrDate(s: string | undefined | null): string | null {
  if (!s || s.length < 8) return null;
  const d = String(s).slice(0, 8);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function strOrNull(v: unknown): string | null {
  const s = v == null ? "" : String(v);
  return s.length > 0 ? s : null;
}

export interface ParsedFlexStatement {
  accountId: string;
  fromDate: string | null;
  toDate: string | null;
  trades: Record<string, unknown>[];
  cash: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  securities: Record<string, unknown>[];
  nav: Record<string, unknown>[];
  // OptionEAE: Option Exercises/Assignments/Expirations. transactionType e' il campo
  // che distingue i tre casi — solo 'Expiration' segue il trattamento standalone del
  // motore lotti, 'Exercise'/'Assignment' vanno segnalati (vedi mapOptionEvent).
  optionEvents: Record<string, unknown>[];
  // Snapshot posizioni aperte a fine periodo — usato SOLO per riconciliazione con
  // tax_lots (motore lotti), non e' input del calcolo fiscale.
  openPositions: Record<string, unknown>[];
  // Sezioni presenti nell'XML ma NON ancora normalizzate in tabelle dedicate
  // (vedi docs/ibkr-flex-query-spec.md) — solo conteggiate per visibilita'.
  nonGestite: { interestAccruals: number; corporateActions: number };
}

export function parseFlexXml(xml: string): ParsedFlexStatement {
  const doc = parser.parse(xml);
  const stmt = doc?.FlexQueryResponse?.FlexStatements?.FlexStatement;
  if (!stmt) throw new Error("FlexStatement assente nell'XML");

  return {
    accountId: String(stmt.accountId),
    fromDate: ibkrDate(stmt.fromDate),
    toDate: ibkrDate(stmt.toDate),
    trades: asArray(stmt.Trades?.Trade),
    cash: asArray(stmt.CashTransactions?.CashTransaction),
    transfers: asArray(stmt.Transfers?.Transfer),
    securities: asArray(stmt.SecuritiesInfo?.SecurityInfo),
    nav: asArray(stmt.EquitySummaryInBase?.EquitySummaryByReportDateInBase),
    optionEvents: asArray(stmt.OptionEAE?.OptionEAE),
    openPositions: asArray(stmt.OpenPositions?.OpenPosition),
    nonGestite: {
      interestAccruals: asArray(stmt.InterestAccruals?.InterestAccrualsCurrency).length,
      corporateActions: asArray(stmt.CorporateActions?.CorporateAction).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Mapping verso le righe normalizzate (tipi di `movimenti`/`tax_movements`).
// ---------------------------------------------------------------------------

const CASH_TYPE_TO_MOVIMENTO_TIPO: Record<string, string> = {
  "Dividends": "dividendo",
  "Withholding Tax": "ritenuta",
  "Bond Interest Received": "interessi",
  "Bond Interest Paid": "interessi",
  "Broker Interest Received": "interessi",
};

// Sottoinsieme fiscale (tax_movements): solo i type con rilevanza dichiarativa diretta.
// "Bond Interest Paid" (rateo pagato in acquisto) e "Deposits/Withdrawals" (flusso esterno)
// restano fuori: il primo va riconciliato dal motore lotti in fase di calcolo cedole, il
// secondo non e' reddito. Nota da rivedere quando si costruisce il motore di calcolo.
const CASH_TYPE_TO_TAX_TIPO: Record<string, string> = {
  "Dividends": "dividendo",
  "Withholding Tax": "ritenuta",
  "Bond Interest Received": "cedola",
  "Broker Interest Received": "interessi",
};

export interface MovimentoRow {
  conto_id: string;
  user_id: string;
  tipo: string;
  data: string;
  data_regolamento: string | null;
  asset_category: string | null;
  symbol: string | null;
  isin: string | null;
  conid: string | null;
  quantita: number | null;
  prezzo: number | null;
  commissioni: number;
  importo: number;
  valuta: string;
  fx_rate: number;
  importo_valuta: number | null;
  ibkr_transaction_id: string | null;
  ibkr_trade_id: string | null;
  descrizione: string | null;
  raw: Record<string, unknown>;
}

export interface TaxMovementRow {
  conto_id: string;
  user_id: string;
  tipo: string;
  data: string;
  quantita: number | null;
  prezzo_eur: number | null;
  importo_eur: number;
  commissioni_eur: number;
  ibkr_transaction_id: string | null;
  ibkr_trade_id: string | null;
  isin: string | null; // usato solo per il lookup instrument_id lato chiamante
  evento_opzione: "exercise" | "assignment" | "expiration" | null; // valorizzato dal chiamante da OptionEAE
}

export function mapTrade(t: Record<string, unknown>, contoId: string, userId: string): {
  movimento: MovimentoRow;
  taxMovement: TaxMovementRow | null;
} {
  const fx = num(t.fxRateToBase) || 1;
  const importoEur = num(t.netCash) * fx;
  const prezzoEur = num(t.tradePrice) * fx;
  const commissioniEur = Math.abs(num(t.ibCommission)) * fx;
  const buySell = String(t.buySell ?? "");
  const assetCategory = strOrNull(t.assetCategory);
  // I trade con assetCategory 'CASH' sono conversioni valutarie (EUR/USD) per finanziare
  // altri acquisti, non compravendita di uno strumento finanziario: niente tax_movement.
  const isFiscallyRelevant = assetCategory !== "CASH";

  const movimento: MovimentoRow = {
    conto_id: contoId,
    user_id: userId,
    tipo: "trade",
    data: ibkrDate(t.tradeDate as string) ?? ibkrDate(t.reportDate as string) ?? "",
    data_regolamento: ibkrDate(t.settleDateTarget as string),
    asset_category: strOrNull(t.assetCategory),
    symbol: strOrNull(t.symbol),
    isin: strOrNull(t.isin),
    conid: strOrNull(t.conid),
    quantita: num(t.quantity),
    prezzo: prezzoEur,
    commissioni: commissioniEur,
    importo: importoEur,
    valuta: String(t.currency ?? "EUR"),
    fx_rate: fx,
    importo_valuta: num(t.netCash),
    ibkr_transaction_id: strOrNull(t.transactionID),
    ibkr_trade_id: strOrNull(t.tradeID),
    descrizione: strOrNull(t.description),
    raw: t,
  };

  const taxMovement: TaxMovementRow | null = isFiscallyRelevant
    ? {
      conto_id: contoId,
      user_id: userId,
      tipo: buySell === "SELL" ? "vendita" : "acquisto",
      data: movimento.data,
      quantita: movimento.quantita,
      prezzo_eur: prezzoEur,
      importo_eur: importoEur,
      commissioni_eur: commissioniEur,
      ibkr_transaction_id: movimento.ibkr_transaction_id,
      ibkr_trade_id: movimento.ibkr_trade_id,
      isin: movimento.isin,
      evento_opzione: null, // valorizzato dal chiamante via mapOptionEventiPerTradeId
    }
    : null;

  return { movimento, taxMovement };
}

export function mapCashTransaction(c: Record<string, unknown>, contoId: string, userId: string): {
  movimento: MovimentoRow;
  taxMovement: TaxMovementRow | null;
} {
  const fx = num(c.fxRateToBase) || 1;
  const amountEur = num(c.amount) * fx;
  const type = String(c.type ?? "");

  let tipo = CASH_TYPE_TO_MOVIMENTO_TIPO[type];
  if (!tipo) {
    tipo = type === "Deposits/Withdrawals" ? (amountEur >= 0 ? "versamento" : "prelievo") : "altro";
  }

  const movimento: MovimentoRow = {
    conto_id: contoId,
    user_id: userId,
    tipo,
    data: ibkrDate(c.dateTime as string) ?? ibkrDate(c.reportDate as string) ?? "",
    data_regolamento: ibkrDate(c.settleDate as string),
    asset_category: null,
    symbol: strOrNull(c.symbol),
    isin: strOrNull(c.isin),
    conid: strOrNull(c.conid),
    quantita: null,
    prezzo: null,
    commissioni: 0,
    importo: amountEur,
    valuta: String(c.currency ?? "EUR"),
    fx_rate: fx,
    importo_valuta: num(c.amount),
    ibkr_transaction_id: strOrNull(c.transactionID),
    ibkr_trade_id: strOrNull(c.tradeID),
    descrizione: strOrNull(c.description) ?? type,
    raw: c,
  };

  const taxTipo = CASH_TYPE_TO_TAX_TIPO[type];
  const taxMovement: TaxMovementRow | null = taxTipo
    ? {
      conto_id: contoId,
      user_id: userId,
      tipo: taxTipo,
      data: movimento.data,
      quantita: null,
      prezzo_eur: null,
      importo_eur: amountEur,
      commissioni_eur: 0,
      ibkr_transaction_id: movimento.ibkr_transaction_id,
      ibkr_trade_id: null,
      isin: movimento.isin,
      evento_opzione: null,
    }
    : null;

  return { movimento, taxMovement };
}

export function mapTransfer(t: Record<string, unknown>, contoId: string, userId: string): MovimentoRow {
  const fx = num(t.fxRateToBase) || 1;
  const hasQuantity = num(t.quantity) !== 0;
  const cashTransfer = num(t.cashTransfer);
  const importoNativo = hasQuantity ? num(t.positionAmountInBase) : cashTransfer;

  return {
    conto_id: contoId,
    user_id: userId,
    tipo: hasQuantity ? "transfer_titoli" : "transfer_cassa",
    data: ibkrDate(t.date as string) ?? ibkrDate(t.dateTime as string) ?? "",
    data_regolamento: ibkrDate(t.settleDate as string),
    asset_category: strOrNull(t.assetCategory),
    symbol: strOrNull(t.symbol),
    isin: strOrNull(t.isin),
    conid: strOrNull(t.conid),
    quantita: hasQuantity ? num(t.quantity) : null,
    prezzo: hasQuantity ? num(t.transferPrice) * fx : null,
    commissioni: 0,
    importo: importoNativo * (hasQuantity ? 1 : fx), // positionAmountInBase gia' in base; cashTransfer no
    valuta: String(t.currency ?? "EUR"),
    fx_rate: fx,
    importo_valuta: hasQuantity ? num(t.positionAmountInBase) : cashTransfer,
    ibkr_transaction_id: strOrNull(t.transactionID),
    ibkr_trade_id: null,
    descrizione: `Transfer ${String(t.type ?? "")} ${String(t.direction ?? "")}`.trim(),
    raw: t,
  };
}

// Media ponderata per ETF/OICR (subCategory='ETF'), LIFO per il resto (azioni, ADR,
// obbligazioni governative, opzioni) — subCategory e' un campo oggettivo di IBKR, non
// un giudizio fiscale nostro. classificazione_confermata resta false: e' un suggerimento.
function metodoCostoDaSubCategory(subCategory: string | null): "lifo" | "media_ponderata" {
  return subCategory === "ETF" ? "media_ponderata" : "lifo";
}

export function mapSecurityInfo(s: Record<string, unknown>) {
  const subCategory = strOrNull(s.subCategory);
  return {
    isin: strOrNull(s.isin),
    conid: strOrNull(s.conid),
    symbol: strOrNull(s.symbol),
    descrizione: strOrNull(s.description),
    asset_category: strOrNull(s.assetCategory),
    sub_category: subCategory,
    issuer: strOrNull(s.issuer),
    issuer_country_code: strOrNull(s.issuerCountryCode),
    metodo_costo: metodoCostoDaSubCategory(subCategory),
    // collegamento al sottostante (rilevante per opzioni/derivati) — solo informativo
    // finche' il motore lotti non gestisce automaticamente esercizio/assegnazione.
    underlying_conid: strOrNull(s.underlyingConid),
    underlying_isin: strOrNull(s.underlyingSecurityID),
    underlying_symbol: strOrNull(s.underlyingSymbol),
  };
}

// OptionEAE -> mappa ibkr_trade_id -> evento ('exercise'|'assignment'|'expiration').
// Solo 'expiration' e' gestito automaticamente dal motore lotti (chiusura standalone,
// comportamento verificato sul caso reale OKLO); 'exercise'/'assignment' vengono
// scritti su tax_movements.evento_opzione per essere segnalati come anomalia dal
// motore, perche' il premio potrebbe dover essere redistribuito sul lotto del
// sottostante (non ancora automatizzato — vedi docs/decisioni-fiscali.md).
export function mapOptionEventiPerTradeId(optionEvents: Record<string, unknown>[]): Map<string, "exercise" | "assignment" | "expiration"> {
  const mappa = new Map<string, "exercise" | "assignment" | "expiration">();
  for (const e of optionEvents) {
    const tradeId = strOrNull(e.tradeID);
    const tipo = String(e.transactionType ?? "").toLowerCase();
    if (tradeId && (tipo === "exercise" || tipo === "assignment" || tipo === "expiration")) {
      mappa.set(tradeId, tipo);
    }
  }
  return mappa;
}

export function mapNavRow(n: Record<string, unknown>, contoId: string, userId: string) {
  return {
    conto_id: contoId,
    user_id: userId,
    report_date: ibkrDate(n.reportDate as string),
    cash_eur: num(n.cash),
    stock_eur: num(n.stock),
    bonds_eur: num(n.bonds),
    options_eur: num(n.options),
    funds_eur: num(n.funds),
    commodities_eur: num(n.commodities),
    crypto_eur: num(n.crypto),
    total_eur: num(n.total),
  };
}

// OpenPosition -> snapshot per riconciliazione con tax_lots (motore lotti). markPrice/
// positionValue/costBasisMoney sono in valuta nativa nell'XML: qui convertiti in EUR via
// fxRateToBase, stessa convenzione di mapTrade/mapCashTransaction.
export function mapOpenPosition(p: Record<string, unknown>, contoId: string, userId: string) {
  const fx = num(p.fxRateToBase) || 1;
  return {
    conto_id: contoId,
    user_id: userId,
    conid: String(p.conid ?? ""),
    isin: strOrNull(p.isin),
    symbol: strOrNull(p.symbol),
    asset_category: strOrNull(p.assetCategory),
    sub_category: strOrNull(p.subCategory),
    report_date: ibkrDate(p.reportDate as string),
    position: num(p.position),
    mark_price: num(p.markPrice) * fx,
    position_value_eur: num(p.positionValue) * fx,
    cost_basis_price: num(p.costBasisPrice) * fx,
    cost_basis_money_eur: num(p.costBasisMoney) * fx,
    fifo_pnl_unrealized_eur: num(p.fifoPnlUnrealized) * fx,
    side: strOrNull(p.side),
    valuta: String(p.currency ?? "EUR"),
    fx_rate: fx,
  };
}

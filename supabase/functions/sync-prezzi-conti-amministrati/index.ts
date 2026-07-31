// sync-prezzi-conti-amministrati — cron giornaliero (service_role): valorizza le
// posizioni aperte dei conti "amministrato" senza export prezzi proprio (Banca
// Generali, Widiba, BG Saxo — qualunque conto con regime_fiscale='amministrato'
// e attivo=true, generico per i prossimi che verranno aggiunti). Scelta esplicita
// dell'utente: niente più import manuale di prezzi/snapshot per questi conti, solo
// i movimenti restano da caricare a mano (broker/banca non offrono un feed prezzi,
// a differenza di IBKR che ha ibkr-flex-pull).
//
// Per ogni conto: aggrega le posizioni nette aperte da `movimenti` (stessa logica
// di web/src/lib/contoGenerico.js), risolve il ticker Yahoo per ISIN (cache in
// tax_instruments.yahoo_ticker, stesso pattern di calcola-rendimenti-storici),
// legge l'ultimo prezzo di chiusura + valuta, converte in EUR col cambio Frankfurter
// (dati ECB) del giorno se la valuta non è EUR, scrive una riga in
// posizioni_aperte_ibkr con report_date = oggi. conid non esiste per questi conti
// (nessun feed IBKR): si usa l'ISIN come conid sintetico, stabile e coerente col
// resto del frontend che per questi conti legge già solo per ISIN.
//
// Mai un prezzo fabbricato: se la risoluzione del ticker, il fetch del prezzo o
// il cambio falliscono, la posizione resta senza aggiornamento per oggi (righe
// precedenti non toccate) — meglio un valore assente/vecchio che uno inventato.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

const YF_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; Budgeting/1.0)", "Accept": "application/json" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function risolviTickerYahoo(isin: string): Promise<{ ticker: string; quoteType: string } | null> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const quotes = (data?.quotes ?? []).filter((q: { quoteType?: string }) => ["ETF", "EQUITY", "MUTUALFUND"].includes(q.quoteType ?? ""));
  if (quotes.length === 0) return null;
  quotes.sort((a: { score?: number }, b: { score?: number }) => (b.score ?? 0) - (a.score ?? 0));
  const scelta = quotes[0];
  return scelta.symbol ? { ticker: scelta.symbol, quoteType: scelta.quoteType ?? "" } : null;
}

// STK/FUND sono le uniche categorie IBKR plausibili per un ticker risolto da
// EQUITY/ETF/MUTUALFUND (vedi filtro sopra) — usate solo per pesare il rendimento
// atteso di default in Dashboard/Proiezioni (CATEGORIA_IBKR_TO_CONFIG lato
// frontend), non per la tassonomia asset_class ufficiale (tax_instruments,
// verificata a mano) che resta l'unica fonte per l'allocazione.
const QUOTE_TYPE_TO_ASSET_CATEGORY: Record<string, string> = { EQUITY: "STK", ETF: "FUND", MUTUALFUND: "FUND" };

async function prezzoCorrenteYahoo(ticker: string): Promise<{ prezzo: number; valuta: string } | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const valuta = result.meta?.currency;
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = closes[i];
    if (c != null && c > 0) return { prezzo: c, valuta: valuta ?? "EUR" };
  }
  const prezzoMeta = result.meta?.regularMarketPrice;
  if (prezzoMeta != null && valuta) return { prezzo: prezzoMeta, valuta };
  return null;
}

async function cambioEur(valuta: string): Promise<number | null> {
  if (valuta === "EUR") return 1;
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(valuta)}&symbols=EUR`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const tasso = data?.rates?.EUR;
  return typeof tasso === "number" ? tasso : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createAdminClient();
    const oggi = new Date().toISOString().slice(0, 10);

    const { data: conti, error: contiErr } = await admin.from("conti")
      .select("id, user_id, broker").eq("attivo", true).eq("regime_fiscale", "amministrato");
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    if (!conti || conti.length === 0) return json(200, { error: null, nota: "Nessun conto amministrato attivo.", dettaglio: {} });

    const dettaglio: Record<string, { isin?: string; yahoo_ticker?: string; prezzo_eur?: number; skipped?: boolean; reason?: string }[]> = {};

    for (const conto of conti) {
      const righeConto: { isin?: string; yahoo_ticker?: string; prezzo_eur?: number; skipped?: boolean; reason?: string }[] = [];

      const { data: movimenti, error: movErr } = await admin.from("movimenti")
        .select("isin, quantita").eq("conto_id", conto.id).not("isin", "is", null);
      if (movErr) { dettaglio[conto.broker] = [{ skipped: true, reason: `lettura movimenti fallita: ${movErr.message}` }]; continue; }

      const nettoPerIsin = new Map<string, number>();
      for (const m of movimenti ?? []) {
        const isin = m.isin as string;
        nettoPerIsin.set(isin, (nettoPerIsin.get(isin) ?? 0) + Number(m.quantita));
      }
      const isinAperti = [...nettoPerIsin.entries()].filter(([, q]) => q > 1e-9).map(([isin]) => isin);
      if (isinAperti.length === 0) { dettaglio[conto.broker] = []; continue; }

      const { data: strumenti, error: strErr } = await admin.from("tax_instruments")
        .select("id, isin, descrizione, yahoo_ticker, asset_category").in("isin", isinAperti);
      if (strErr) { dettaglio[conto.broker] = [{ skipped: true, reason: `lettura tax_instruments fallita: ${strErr.message}` }]; continue; }
      const strumentoPerIsin = new Map((strumenti ?? []).map((s) => [s.isin as string, s]));

      const righeUpsert: Record<string, unknown>[] = [];

      for (const isin of isinAperti) {
        const strumento = strumentoPerIsin.get(isin);
        if (!strumento) { righeConto.push({ isin, skipped: true, reason: "nessuna riga tax_instruments per questo ISIN" }); continue; }

        // yahoo_ticker/asset_category sono cachati su tax_instruments: risolti una
        // volta sola, non ad ogni run giornaliero. asset_category va letto dalla
        // cache anche quando yahoo_ticker era già presente (es. ISIN condiviso con
        // IBKR, che lo valorizza per suo conto) — altrimenti dal secondo giorno in
        // poi ogni riga avrebbe asset_category null e il peso nel CAGR di
        // Dashboard/Proiezioni sparirebbe silenziosamente.
        let yahooTicker = strumento.yahoo_ticker as string | null;
        let assetCategory = (strumento.asset_category as string | null) ?? null;
        if (!yahooTicker) {
          const risolto = await risolviTickerYahoo(isin);
          if (!risolto) { righeConto.push({ isin, skipped: true, reason: "ticker Yahoo non risolto da ISIN" }); await new Promise((r) => setTimeout(r, 300)); continue; }
          yahooTicker = risolto.ticker;
          const aggiornamento: Record<string, unknown> = { yahoo_ticker: yahooTicker };
          if (!assetCategory) {
            assetCategory = QUOTE_TYPE_TO_ASSET_CATEGORY[risolto.quoteType] ?? null;
            if (assetCategory) aggiornamento.asset_category = assetCategory;
          }
          await admin.from("tax_instruments").update(aggiornamento).eq("id", strumento.id);
        }

        const prezzoNativo = await prezzoCorrenteYahoo(yahooTicker);
        if (!prezzoNativo) { righeConto.push({ isin, yahoo_ticker: yahooTicker, skipped: true, reason: "prezzo corrente non disponibile da Yahoo Finance" }); await new Promise((r) => setTimeout(r, 300)); continue; }

        const fx = await cambioEur(prezzoNativo.valuta);
        if (fx == null) { righeConto.push({ isin, yahoo_ticker: yahooTicker, skipped: true, reason: `cambio ${prezzoNativo.valuta}->EUR non disponibile` }); await new Promise((r) => setTimeout(r, 300)); continue; }

        const quantita = nettoPerIsin.get(isin)!;
        const prezzoEur = prezzoNativo.prezzo * fx;

        righeUpsert.push({
          user_id: conto.user_id,
          conto_id: conto.id,
          conid: isin, // nessun conid reale per un conto non-IBKR: ISIN come identificativo sintetico stabile
          isin,
          symbol: strumento.descrizione ?? yahooTicker,
          asset_category: assetCategory,
          report_date: oggi,
          position: quantita,
          mark_price: prezzoNativo.prezzo,
          position_value_eur: quantita * prezzoEur,
          valuta: prezzoNativo.valuta,
          fx_rate: fx,
        });
        righeConto.push({ isin, yahoo_ticker: yahooTicker, prezzo_eur: Math.round(prezzoEur * 100) / 100 });
        await new Promise((r) => setTimeout(r, 300));
      }

      if (righeUpsert.length > 0) {
        const { error: upsertErr } = await admin.from("posizioni_aperte_ibkr")
          .upsert(righeUpsert, { onConflict: "conto_id,conid,report_date" });
        if (upsertErr) righeConto.push({ skipped: true, reason: `upsert fallito: ${upsertErr.message}` });
      }
      dettaglio[conto.broker] = righeConto;
    }

    return json(200, { error: null, dettaglio });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

// calcola-rendimenti-storici — Fase 5 (ESPERTO DI FINANZA), raffinamento proiezioni:
// per ogni strumento in posizione aperta, risolve il ticker Yahoo Finance per ISIN
// (cachato in tax_instruments.yahoo_ticker) e calcola il CAGR sugli ultimi ~5 anni di
// prezzi (adjclose). Da rilanciare a mano quando serve un refresh — non un cron.
//
// Mai un dato fabbricato: se la risoluzione del ticker o il fetch falliscono, o lo
// storico disponibile è troppo corto (<2 anni), lo strumento resta senza
// rendimento_5y_pct e le proiezioni usano il fallback per categoria.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

const YF_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; Budgeting/1.0)", "Accept": "application/json" };
const ANNI_MASSIMI = 5;
const ANNI_MINIMI = 2;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function risolviTickerYahoo(isin: string): Promise<string | null> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const quotes = (data?.quotes ?? []).filter((q: { quoteType?: string }) => ["ETF", "EQUITY", "MUTUALFUND"].includes(q.quoteType ?? ""));
  if (quotes.length === 0) return null;
  quotes.sort((a: { score?: number }, b: { score?: number }) => (b.score ?? 0) - (a.score ?? 0));
  return quotes[0].symbol ?? null;
}

async function fetchStoricoYahoo(ticker: string, period1: number, period2: number): Promise<{ timestamps: number[]; closes: (number | null)[] } | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? [];
  return { timestamps, closes };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Authorization mancante" });

    const admin = createAdminClient();
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json(401, { error: "Token non valido" });
    const userId = userData.user.id;

    const { data: ultimaData } = await admin.from("posizioni_aperte_ibkr")
      .select("report_date").eq("user_id", userId).order("report_date", { ascending: false }).limit(1).maybeSingle();
    if (!ultimaData) return json(200, { error: null, nota: "Nessuno snapshot posizioni disponibile.", dettaglio: {} });

    const { data: posizioni, error: posErr } = await admin.from("posizioni_aperte_ibkr")
      .select("conid").eq("user_id", userId).eq("report_date", ultimaData.report_date);
    if (posErr) return json(500, { error: `Lettura posizioni_aperte_ibkr fallita: ${posErr.message}` });

    const conidUnici = [...new Set((posizioni ?? []).map((p) => p.conid as string))];
    if (conidUnici.length === 0) return json(200, { error: null, nota: "Nessuna posizione aperta.", dettaglio: {} });

    const { data: strumenti, error: strErr } = await admin.from("tax_instruments")
      .select("id, conid, isin, symbol, yahoo_ticker").in("conid", conidUnici);
    if (strErr) return json(500, { error: `Lettura tax_instruments fallita: ${strErr.message}` });

    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - ANNI_MASSIMI * 365.25 * 86400;

    const dettaglio: Record<string, { yahoo_ticker?: string; rendimento_5y_pct?: number; anni_dati_disponibili?: number; skipped?: boolean; reason?: string }> = {};

    for (const strumento of strumenti ?? []) {
      const chiave = strumento.symbol ?? strumento.id;
      let yahooTicker = strumento.yahoo_ticker as string | null;

      if (!yahooTicker) {
        if (!strumento.isin) {
          dettaglio[chiave] = { skipped: true, reason: "nessun ISIN per la risoluzione" };
          continue;
        }
        yahooTicker = await risolviTickerYahoo(strumento.isin);
        if (!yahooTicker) {
          dettaglio[chiave] = { skipped: true, reason: "ticker Yahoo non risolto da ISIN" };
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
      }

      const hist = await fetchStoricoYahoo(yahooTicker, period1, period2);
      if (!hist || hist.timestamps.length === 0) {
        dettaglio[chiave] = { yahoo_ticker: yahooTicker, skipped: true, reason: "nessun dato storico da Yahoo Finance" };
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      let primoIdx = -1, ultimoIdx = -1;
      for (let i = 0; i < hist.closes.length; i++) {
        if (hist.closes[i] != null && (hist.closes[i] as number) > 0) {
          if (primoIdx === -1) primoIdx = i;
          ultimoIdx = i;
        }
      }
      if (primoIdx === -1 || ultimoIdx === primoIdx) {
        dettaglio[chiave] = { yahoo_ticker: yahooTicker, skipped: true, reason: "prezzi insufficienti" };
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      const anni = (hist.timestamps[ultimoIdx] - hist.timestamps[primoIdx]) / (365.25 * 86400);
      if (anni < ANNI_MINIMI) {
        dettaglio[chiave] = { yahoo_ticker: yahooTicker, skipped: true, reason: `storico troppo corto (${anni.toFixed(1)} anni)` };
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      const primo = hist.closes[primoIdx] as number;
      const ultimo = hist.closes[ultimoIdx] as number;
      const rendimentoPct = (Math.pow(ultimo / primo, 1 / anni) - 1) * 100;

      const { error: updErr } = await admin.from("tax_instruments").update({
        yahoo_ticker: yahooTicker,
        rendimento_5y_pct: Math.round(rendimentoPct * 100) / 100,
        anni_dati_disponibili: Math.round(anni * 10) / 10,
        rendimento_5y_calcolato_il: new Date().toISOString(),
      }).eq("id", strumento.id);

      dettaglio[chiave] = updErr
        ? { yahoo_ticker: yahooTicker, skipped: true, reason: `errore salvataggio: ${updErr.message}` }
        : { yahoo_ticker: yahooTicker, rendimento_5y_pct: Math.round(rendimentoPct * 100) / 100, anni_dati_disponibili: Math.round(anni * 10) / 10 };

      await new Promise((r) => setTimeout(r, 300));
    }

    return json(200, { error: null, dettaglio });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

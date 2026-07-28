import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur, fmtPct } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";
import { quotaContoIbkr } from "../../lib/conto.js";
import { caricaPosizioniBancaGenerali } from "../../lib/bancaGenerali.js";
import { caricaPosizioniWidiba } from "../../lib/widiba.js";
import { caricaPosizioniBgSaxo } from "../../lib/bgSaxo.js";

// Aggregazione client-side di tax_lots aperti + valore attuale dall'ultimo snapshot
// posizioni_aperte_ibkr, raggruppata per asset_class (classificazione normalizzata
// derivata dalla descrizione del fondo — vedi migration 0031 e Fase Verifica).
const ASSET_CLASS_LABEL = {
  Equity: "Azionario", "Fixed Income": "Obbligazionario", Commodities: "Materie prime",
  "Real Estate": "Immobiliare", Alternative: "Alternativo", "Multi-Asset": "Multi-asset",
  Liquidity: "Liquidità", Other: "Altro",
};
const ASSET_CLASS_ORDER = ["Equity", "Fixed Income", "Real Estate", "Commodities", "Alternative", "Multi-Asset", "Liquidity", "Other"];

function fmtQty(n) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function fmtDataBreve(iso) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

// Crosshair hover: overlay mousemove mappa la X alla data più vicina e mostra un
// tooltip data+valore (stesso pattern di HeroChart in Dashboard.jsx).
function ChartSerie({ serie }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const w = 640, h = 200, padY = 10;
  const values = serie.map((s) => s.v);
  // Dominio sul range effettivo dei dati (+ margine), non forzato a partire da 0:
  // altrimenti su periodi brevi (dove il valore oscilla in una fascia stretta
  // rispetto al totale) la linea appare quasi piatta e le oscillazioni reali
  // spariscono. Stesso principio già applicato in Casa.jsx (costo unitario).
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const margine = (maxRaw - minRaw) * 0.15 || Math.abs(maxRaw) * 0.1 || 1;
  const max = maxRaw + margine;
  const min = Math.max(0, minRaw - margine);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1 || 1)) * w,
    y: padY + (1 - (v - min) / range) * (h - 2 * padY),
  }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} ${w},${h} 0,${h}`;

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round((relX / w) * (values.length - 1))));
    setHoverIdx(idx);
  }

  return (
    <div className="relative">
      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1 text-xs font-bold text-white"
          style={{ left: `${(pts[hoverIdx].x / w) * 100}%`, top: `${Math.max(0, (pts[hoverIdx].y / h) * 100)}%` }}
        >
          <div>{fmtDataBreve(serie[hoverIdx].data)}</div>
          <div>{fmtEur(values[hoverIdx])}</div>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-48 w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="gradPerf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B4FF39" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#B4FF39" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#gradPerf)" />
        <polyline points={line} fill="none" stroke="#0B0C10" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx !== null && (
          <>
            <line x1={pts[hoverIdx].x} y1={0} x2={pts[hoverIdx].x} y2={h} stroke="#0B0C10" strokeWidth="1" strokeDasharray="2,2" opacity="0.35" />
            <circle cx={pts[hoverIdx].x} cy={pts[hoverIdx].y} r="4" fill="#0B0C10" stroke="#FFFFFF" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  );
}

export default function Portafoglio() {
  const { intestatarioId, periodoGiorni } = useFilters();
  const [stato, setStato] = useState("loading");
  const [righe, setRighe] = useState([]);
  const [info, setInfo] = useState("");
  const [serie, setSerie] = useState([]);

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        const quota = await quotaContoIbkr(intestatarioId);

        const [{ data: lottiRaw, error: erroreLotti }, { data: strumenti, error: erroreStrumenti }, { data: ultimoNav }] = await Promise.all([
          supabase.from("tax_lots").select("instrument_id, quantita_residua, costo_unitario_eur").eq("stato", "aperto"),
          supabase.from("tax_instruments").select("id, symbol, descrizione, asset_class, isin, conid"),
          supabase.from("conto_nav_giornaliero").select("cash_eur").order("report_date", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (erroreLotti || erroreStrumenti) throw erroreLotti || erroreStrumenti;
        // Con quota 0 (intestatario non cointestatario del conto) le righe non
        // vanno solo azzerate nel valore: sono posizioni di un'altra persona e
        // non devono comparire affatto — vedi stesso principio in Dashboard.jsx.
        const lotti = quota === 0 ? [] : lottiRaw;
        const cashEur = quota === 0 ? 0 : (ultimoNav ? Number(ultimoNav.cash_eur) * quota : 0);

        let ultimaData = null;
        let posizioni = [];
        if (quota > 0) {
          const { data: dataUltima } = await supabase
            .from("posizioni_aperte_ibkr").select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
          ultimaData = dataUltima?.report_date ?? null;
          if (ultimaData) {
            const { data } = await supabase.from("posizioni_aperte_ibkr")
              .select("isin, conid, mark_price, position_value_eur").eq("report_date", ultimaData);
            posizioni = data ?? [];
          }
        }
        const posPerIsin = new Map(posizioni.filter((p) => p.isin).map((p) => [p.isin, p]));
        const posPerConid = new Map(posizioni.map((p) => [p.conid, p]));
        const strumentoPerId = new Map((strumenti ?? []).map((s) => [s.id, s]));

        const aggregati = new Map();
        for (const lotto of lotti ?? []) {
          const esistente = aggregati.get(lotto.instrument_id) ?? { quantita: 0, costo: 0 };
          const quantitaScalata = Number(lotto.quantita_residua) * quota;
          esistente.quantita += quantitaScalata;
          esistente.costo += quantitaScalata * Number(lotto.costo_unitario_eur);
          aggregati.set(lotto.instrument_id, esistente);
        }

        const risultatoIbkr = [...aggregati.entries()].map(([instrumentId, agg]) => {
          const strumento = strumentoPerId.get(instrumentId);
          const posizione = strumento?.isin ? posPerIsin.get(strumento.isin) : posPerConid.get(strumento?.conid);
          const valoreAttuale = posizione ? Number(posizione.position_value_eur) * quota : null;
          const plNonRealizzato = valoreAttuale !== null ? valoreAttuale - agg.costo : null;
          return {
            symbol: strumento?.symbol ?? "?",
            assetClass: strumento?.asset_class ?? null,
            quantita: agg.quantita,
            costo: agg.costo,
            valoreAttuale,
            plNonRealizzato,
            plPct: plNonRealizzato !== null && agg.costo > 0 ? (plNonRealizzato / agg.costo) * 100 : null,
          };
        });

        // Conti Banca Generali/Widiba/BG Saxo: 100%/0% per intestatario (mai
        // frazionario, vedi lib/contoGenerico.js), righe già nella stessa forma
        // di quelle IBKR.
        const [risultatoBancaGenerali, risultatoWidiba, risultatoBgSaxo] = await Promise.all([
          caricaPosizioniBancaGenerali(intestatarioId),
          caricaPosizioniWidiba(intestatarioId),
          caricaPosizioniBgSaxo(intestatarioId),
        ]);
        const risultato = [...risultatoIbkr, ...risultatoBancaGenerali, ...risultatoWidiba, ...risultatoBgSaxo].sort((a, b) => a.symbol.localeCompare(b.symbol));

        // La liquidità IBKR fa parte a tutti gli effetti del portafoglio investito:
        // riga sintetica senza costo/P&L (non ha un prezzo di carico), ma conta nel
        // valore totale e nella ripartizione per asset class (categoria Liquidity).
        if (cashEur > 0) {
          risultato.push({
            symbol: "Liquidità", assetClass: "Liquidity", quantita: null,
            costo: 0, valoreAttuale: cashEur, plNonRealizzato: null, plPct: null,
          });
        }

        let serieNav = [];
        if (quota > 0) {
          let navQuery = supabase.from("conto_nav_giornaliero")
            .select("report_date, stock_eur, bonds_eur").order("report_date", { ascending: true });
          if (periodoGiorni) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - periodoGiorni);
            navQuery = navQuery.gte("report_date", cutoff.toISOString().slice(0, 10));
          }
          const { data: nav } = await navQuery;
          serieNav = (nav ?? []).map((n) => ({ v: (Number(n.stock_eur) + Number(n.bonds_eur)) * quota, data: n.report_date }));
        }

        if (!annullato) {
          setRighe(risultato);
          setSerie(serieNav);
          if (quota === 0) {
            setInfo("Questo conto non ti appartiene (quota 0%): nessuna posizione da mostrare.");
          } else {
            const notaQuota = quota < 1 ? ` Conto cointestato: mostrata solo la quota del ${(quota * 100).toFixed(0)}% di questo intestatario.` : "";
            setInfo((ultimaData ? `Valori attuali dall'ultimo snapshot disponibile (${ultimaData}) — non prezzi live.` : "Nessuno snapshot posizioni disponibile: solo quantità/costo.") + notaQuota);
          }
          setStato("ready");
        }
      } catch (e) {
        console.error(e);
        if (!annullato) setStato("error");
      }
    })();
    return () => { annullato = true; };
  }, [intestatarioId, periodoGiorni]);

  if (stato === "loading") return <p className="text-sm text-muted">Caricamento...</p>;
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento del portafoglio.</p>;

  const totaleCosto = righe.reduce((s, r) => s + r.costo, 0);
  const totaleValore = righe.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
  const plTotale = totaleValore - totaleCosto;
  const plTotalePct = totaleCosto > 0 ? (plTotale / totaleCosto) * 100 : 0;

  const gruppi = new Map();
  for (const r of righe) {
    const chiave = r.assetClass ?? "Non classificato";
    const arr = gruppi.get(chiave) ?? [];
    arr.push(r);
    gruppi.set(chiave, arr);
  }
  const ordineGruppi = [...gruppi.keys()].sort((a, b) => {
    const ia = ASSET_CLASS_ORDER.indexOf(a), ib = ASSET_CLASS_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const primaData = serie[0];
  const ultimaVoceSerie = serie[serie.length - 1];
  const variazioneStorica = primaData && ultimaVoceSerie && primaData.v > 0 ? ((ultimaVoceSerie.v - primaData.v) / primaData.v) * 100 : null;

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Portafoglio</h2>
      <p className="mb-5 text-sm text-muted">{info}</p>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><p className="mb-1 text-xs font-semibold text-muted">Valore attuale</p><p className="font-display text-lg font-extrabold">{fmtEur(totaleValore)}</p></Card>
        <Card><p className="mb-1 text-xs font-semibold text-muted">Costo totale</p><p className="font-display text-lg font-extrabold">{fmtEur(totaleCosto)}</p></Card>
        <Card>
          <p className="mb-1 text-xs font-semibold text-muted">P&amp;L non realizzato</p>
          <p className={`font-display text-lg font-extrabold ${plTotale >= 0 ? "text-pos" : "text-neg"}`}>{fmtEur(plTotale)}</p>
          <p className={`text-xs font-bold ${plTotale >= 0 ? "text-pos" : "text-neg"}`}>{plTotale >= 0 ? "+" : ""}{fmtPct(plTotalePct)}</p>
        </Card>
        <Card>
          <p className="mb-1 text-xs font-semibold text-muted">Variazione storica</p>
          <p className={`font-display text-lg font-extrabold ${variazioneStorica >= 0 ? "text-pos" : "text-neg"}`}>{variazioneStorica !== null ? `${variazioneStorica >= 0 ? "+" : ""}${fmtPct(variazioneStorica)}` : "n/d"}</p>
          <p className="text-xs text-muted">dal {primaData?.data ?? "-"}</p>
        </Card>
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 font-display text-sm font-bold">Andamento valore titoli (azionario + obbligazionario)</h3>
        {serie.length > 1 ? <ChartSerie serie={serie} /> : <p className="text-sm text-muted">Storico insufficiente.</p>}
      </Card>

      {ordineGruppi.map((chiave) => {
        const righeGruppo = gruppi.get(chiave);
        const costoGruppo = righeGruppo.reduce((s, r) => s + r.costo, 0);
        const valoreGruppo = righeGruppo.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
        const plGruppo = valoreGruppo - costoGruppo;
        return (
          <div key={chiave} className="mb-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display text-sm font-bold">{ASSET_CLASS_LABEL[chiave] ?? chiave}</h3>
              <span className="text-xs text-muted">{fmtEur(valoreGruppo)} · {((valoreGruppo / totaleValore) * 100 || 0).toFixed(1)}% del portafoglio</span>
            </div>
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-semibold">Strumento</th>
                    <th className="px-5 py-3 text-right font-semibold">Quantità</th>
                    <th className="px-5 py-3 text-right font-semibold">Costo</th>
                    <th className="px-5 py-3 text-right font-semibold">Valore attuale</th>
                    <th className="px-5 py-3 text-right font-semibold">P&amp;L</th>
                    <th className="px-5 py-3 text-right font-semibold">P&amp;L %</th>
                  </tr>
                </thead>
                <tbody>
                  {righeGruppo.map((r) => (
                    <tr key={r.symbol} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 font-bold">{r.symbol}</td>
                      <td className="px-5 py-2.5 text-right">{r.quantita !== null ? fmtQty(r.quantita) : "-"}</td>
                      <td className="px-5 py-2.5 text-right">{fmtEur(r.costo)}</td>
                      <td className="px-5 py-2.5 text-right">{r.valoreAttuale !== null ? fmtEur(r.valoreAttuale) : "-"}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${r.plNonRealizzato > 0 ? "text-pos" : r.plNonRealizzato < 0 ? "text-neg" : ""}`}>
                        {r.plNonRealizzato !== null ? fmtEur(r.plNonRealizzato) : "-"}
                      </td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${r.plPct > 0 ? "text-pos" : r.plPct < 0 ? "text-neg" : ""}`}>
                        {r.plPct !== null ? `${r.plPct >= 0 ? "+" : ""}${fmtPct(r.plPct)}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-bold">
                    <td className="px-5 py-3" colSpan={2}>Subtotale</td>
                    <td className="px-5 py-3 text-right">{fmtEur(costoGruppo)}</td>
                    <td className="px-5 py-3 text-right">{fmtEur(valoreGruppo)}</td>
                    <td className={`px-5 py-3 text-right ${plGruppo >= 0 ? "text-pos" : "text-neg"}`} colSpan={2}>{fmtEur(plGruppo)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

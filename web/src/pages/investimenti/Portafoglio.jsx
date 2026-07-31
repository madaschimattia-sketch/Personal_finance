import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur, fmtPct } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";
import { quotaContoIbkr, contoIdIbkr } from "../../lib/conto.js";
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

const COLONNE = [
  { chiave: "symbol", label: "Strumento", align: "left" },
  { chiave: "conto", label: "Conto", align: "left" },
  { chiave: "quantita", label: "Quantità", align: "right" },
  { chiave: "costo", label: "Costo", align: "right" },
  { chiave: "valoreAttuale", label: "Valore attuale", align: "right" },
  { chiave: "plNonRealizzato", label: "P&L", align: "right" },
  { chiave: "plPct", label: "P&L %", align: "right" },
];
const COLONNE_TESTO = new Set(["symbol", "conto"]);

// I valori null (es. valoreAttuale senza snapshot) vanno sempre in fondo,
// qualunque sia la direzione di ordinamento — altrimenti "asc" li mette
// prima di ogni numero reale, che è fuorviante.
function confrontaColonna(a, b, chiave, dir) {
  const va = a[chiave], vb = b[chiave];
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (COLONNE_TESTO.has(chiave)) return dir * String(va).localeCompare(String(vb));
  return dir * (Number(va) - Number(vb));
}

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

const SOGLIA_GIORNI_PREZZO_MANUALE = 7; // aggiornamento atteso settimanale, non giornaliero come il sync Yahoo

// Riga di inserimento prezzo manuale per uno strumento che Yahoo Finance non
// trova (bond/fondi non quotati lì — vedi sync-prezzi-conti-amministrati, che
// li lascia senza prezzo invece di inventarne uno). Scrive direttamente in
// posizioni_aperte_ibkr (stessa tabella/convenzione del sync automatico:
// conid = isin sintetico, report_date = oggi) così il resto del frontend non
// deve distinguere prezzo manuale da prezzo Yahoo. Resta in questa sezione
// anche dopo il primo inserimento (yahooTicker resta null per sempre per
// questi ISIN) — altrimenti sparirebbe dalla vista e non ci sarebbe modo di
// segnalare quando il prezzo inserito è vecchio.
function RigaPrezzoManuale({ riga, onSalvato }) {
  const [prezzo, setPrezzo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  async function salva() {
    const p = Number(prezzo.replace(",", "."));
    if (!p || p <= 0) { setErrore("Prezzo non valido"); return; }
    setSalvando(true);
    setErrore("");
    const { data: sessione } = await supabase.auth.getSession();
    const userId = sessione?.session?.user?.id;
    if (!userId) { setErrore("Sessione non valida"); setSalvando(false); return; }
    const oggi = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from("posizioni_aperte_ibkr").upsert({
      user_id: userId,
      conto_id: riga.contoId,
      conid: riga.isin, // stesso identificativo sintetico usato dal sync automatico
      isin: riga.isin,
      symbol: riga.symbol,
      report_date: oggi,
      position: riga.quantita,
      mark_price: p,
      position_value_eur: riga.quantita * p,
      valuta: "EUR",
      fx_rate: 1,
    }, { onConflict: "conto_id,conid,report_date" });

    setSalvando(false);
    if (error) setErrore(error.message);
    else { setPrezzo(""); onSalvato(riga, p, oggi); }
  }

  const giorniFa = riga.dataPrezzo ? Math.floor((Date.now() - new Date(riga.dataPrezzo).getTime()) / 86400000) : null;
  const scaduto = giorniFa === null || giorniFa > SOGLIA_GIORNI_PREZZO_MANUALE;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-0">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-bold">{riga.symbol}</p>
        <p className="text-xs text-muted">{riga.conto} · {riga.isin} · {fmtQty(riga.quantita)} unità</p>
        <p className={`text-xs ${scaduto ? "font-semibold text-neg" : "text-muted"}`}>
          {riga.valoreAttuale !== null
            ? `Ultimo prezzo: ${fmtEur(riga.valoreAttuale / riga.quantita)} al ${riga.dataPrezzo} (${giorniFa === 0 ? "oggi" : `${giorniFa} giorno/i fa`})`
            : "Nessun prezzo inserito ancora"}
        </p>
      </div>
      <input
        type="text" inputMode="decimal" value={prezzo} onChange={(e) => setPrezzo(e.target.value)}
        placeholder="Prezzo EUR" onKeyDown={(e) => e.key === "Enter" && salva()}
        className="w-32 rounded-chip border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-hero"
      />
      <button type="button" onClick={salva} disabled={salvando}
        className="rounded-chip bg-hero px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
        {salvando ? "Salvo..." : "Salva"}
      </button>
      {errore && <span className="text-xs text-neg">{errore}</span>}
    </div>
  );
}

export default function Portafoglio() {
  const { intestatarioId, periodoGiorni } = useFilters();
  const [stato, setStato] = useState("loading");
  const [righe, setRighe] = useState([]);
  const [info, setInfo] = useState("");
  const [serie, setSerie] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [filtroConto, setFiltroConto] = useState("");
  const [ordinamento, setOrdinamento] = useState({ chiave: null, dir: 1 });
  const [gruppiCollassati, setGruppiCollassati] = useState(() => new Set());
  const [aggiornamentiPrezzi, setAggiornamentiPrezzi] = useState([]);

  function alternaOrdinamento(chiave) {
    setOrdinamento((o) => (o.chiave === chiave ? { chiave, dir: -o.dir } : { chiave, dir: 1 }));
  }

  function alternaGruppo(chiave) {
    setGruppiCollassati((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(chiave)) nuovo.delete(chiave); else nuovo.add(chiave);
      return nuovo;
    });
  }

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        const [quota, contoId] = await Promise.all([quotaContoIbkr(intestatarioId), contoIdIbkr()]);

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
        if (quota > 0 && contoId) {
          const { data: dataUltima } = await supabase
            .from("posizioni_aperte_ibkr").select("report_date").eq("conto_id", contoId).order("report_date", { ascending: false }).limit(1).maybeSingle();
          ultimaData = dataUltima?.report_date ?? null;
          if (ultimaData) {
            const { data } = await supabase.from("posizioni_aperte_ibkr")
              .select("isin, conid, mark_price, position_value_eur").eq("conto_id", contoId).eq("report_date", ultimaData);
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
            conto: "IBKR",
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
            symbol: "Liquidità", conto: "IBKR", assetClass: "Liquidity", quantita: null,
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

        // Tabella di verifica "ultimo aggiornamento prezzi": informativa su TUTTI i
        // conti attivi, indipendentemente dall'intestatario/quota selezionato — serve
        // a controllare che il cron sync-prezzi-conti-amministrati (e i pull IBKR)
        // stiano davvero girando, non a mostrare valori di portafoglio.
        const { data: tuttiConti } = await supabase.from("conti").select("id, broker").eq("attivo", true);
        const { data: tutteLePosizioni } = await supabase.from("posizioni_aperte_ibkr").select("conto_id, report_date");
        const ultimaDataPerConto = new Map();
        for (const p of tutteLePosizioni ?? []) {
          const attuale = ultimaDataPerConto.get(p.conto_id);
          if (!attuale || p.report_date > attuale) ultimaDataPerConto.set(p.conto_id, p.report_date);
        }
        const aggiornamenti = (tuttiConti ?? []).map((c) => ({ conto: c.broker, ultimoAggiornamento: ultimaDataPerConto.get(c.id) ?? null }));

        if (!annullato) {
          setRighe(risultato);
          setSerie(serieNav);
          setAggiornamentiPrezzi(aggiornamenti);
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

  // Strumenti davvero senza fonte automatica: né Yahoo né il fallback Borsa
  // Italiana (borsaitalianaUrl, vedi contoGenerico.js) li coprono. Sezione
  // persistente, non solo "finché non c'è un prezzo", altrimenti non ci
  // sarebbe modo di segnalare un prezzo vecchio. IBKR escluso: lì il prezzo
  // arriva dall'export Flex, non da Yahoo/Borsa Italiana/inserimento manuale.
  const righeManuali = righe.filter((r) => r.conto !== "IBKR" && !r.yahooTicker && !r.borsaitalianaUrl);

  function applicaPrezzoManuale(riga, prezzo, dataPrezzo) {
    setRighe((prev) => prev.map((r) => {
      if (r.conto !== riga.conto || r.isin !== riga.isin) return r;
      const valoreAttuale = r.quantita * prezzo;
      const plNonRealizzato = valoreAttuale - r.costo;
      return { ...r, valoreAttuale, plNonRealizzato, dataPrezzo, plPct: r.costo > 0 ? (plNonRealizzato / r.costo) * 100 : null };
    }));
  }

  if (stato === "loading") return <p className="text-sm text-muted">Caricamento...</p>;
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento del portafoglio.</p>;

  const totaleCosto = righe.reduce((s, r) => s + r.costo, 0);
  const totaleValore = righe.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
  const plTotale = totaleValore - totaleCosto;
  const plTotalePct = totaleCosto > 0 ? (plTotale / totaleCosto) * 100 : 0;

  // Il filtro testuale/conto e l'ordinamento per colonna agiscono solo sulle
  // tabelle per gruppo: i totali in alto restano quelli dell'intero
  // portafoglio, altrimenti filtrare "nvidia" farebbe sembrare che il resto
  // del patrimonio sia sparito.
  const contiDisponibili = [...new Set(righe.map((r) => r.conto))].sort();
  const righeFiltrate = righe
    .filter((r) => !filtro.trim() || r.symbol.toLowerCase().includes(filtro.trim().toLowerCase()))
    .filter((r) => !filtroConto || r.conto === filtroConto);

  const gruppi = new Map();
  for (const r of righeFiltrate) {
    const chiave = r.assetClass ?? "Non classificato";
    const arr = gruppi.get(chiave) ?? [];
    arr.push(r);
    gruppi.set(chiave, arr);
  }
  if (ordinamento.chiave) {
    for (const arr of gruppi.values()) arr.sort((a, b) => confrontaColonna(a, b, ordinamento.chiave, ordinamento.dir));
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

      {aggiornamentiPrezzi.length > 0 && (
        <Card className="mb-6 overflow-x-auto p-0">
          <h3 className="px-5 pt-4 font-display text-sm font-bold">Ultimo aggiornamento prezzi per conto</h3>
          <p className="px-5 pb-3 text-xs text-muted">Verifica che il sync giornaliero (IBKR via Flex, gli altri via Yahoo Finance) sia effettivamente aggiornato — non i valori di portafoglio sopra.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-semibold">Conto</th>
                <th className="px-5 py-2.5 font-semibold">Ultimo aggiornamento</th>
              </tr>
            </thead>
            <tbody>
              {aggiornamentiPrezzi.map((a) => {
                const giorniFa = a.ultimoAggiornamento ? Math.floor((Date.now() - new Date(a.ultimoAggiornamento).getTime()) / 86400000) : null;
                const stantio = giorniFa !== null && giorniFa > 2;
                return (
                  <tr key={a.conto} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 font-bold">{a.conto}</td>
                    <td className={`px-5 py-2 ${!a.ultimoAggiornamento ? "text-muted" : stantio ? "text-neg font-semibold" : ""}`}>
                      {a.ultimoAggiornamento ? `${a.ultimoAggiornamento} (${giorniFa === 0 ? "oggi" : `${giorniFa} giorno/i fa`})` : "mai"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {righeManuali.length > 0 && (
        <Card className="mb-6">
          <h3 className="mb-1 font-display text-sm font-bold">Prezzi da aggiornare a mano</h3>
          <p className="mb-3 text-xs text-muted">
            Né Yahoo Finance né il fallback Borsa Italiana coprono questi strumenti — il sync giornaliero li salta invece di stimare un prezzo. Aggiornamento atteso settimanale: segnalato in rosso solo oltre {SOGLIA_GIORNI_PREZZO_MANUALE} giorni.
          </p>
          {righeManuali.map((r) => (
            <RigaPrezzoManuale key={`${r.conto}-${r.isin}`} riga={r} onSalvato={applicaPrezzoManuale} />
          ))}
        </Card>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtra per nome strumento..."
          className="w-full rounded-chip border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-hero sm:w-80"
        />
        <select
          value={filtroConto}
          onChange={(e) => setFiltroConto(e.target.value)}
          className="w-full rounded-chip border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-hero sm:w-52"
        >
          <option value="">Tutti i conti</option>
          {contiDisponibili.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {ordineGruppi.length === 0 && (
        <p className="text-sm text-muted">Nessuno strumento corrisponde al filtro.</p>
      )}

      {ordineGruppi.map((chiave) => {
        const righeGruppo = gruppi.get(chiave);
        const costoGruppo = righeGruppo.reduce((s, r) => s + r.costo, 0);
        const valoreGruppo = righeGruppo.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
        const plGruppo = valoreGruppo - costoGruppo;
        const collassato = gruppiCollassati.has(chiave);
        return (
          <div key={chiave} className="mb-5">
            <button
              type="button"
              onClick={() => alternaGruppo(chiave)}
              className="mb-2 flex w-full items-baseline justify-between text-left"
            >
              <h3 className="font-display text-sm font-bold">
                <span className="mr-1.5 inline-block text-muted transition-transform" style={{ transform: collassato ? "rotate(-90deg)" : "none" }}>▾</span>
                {ASSET_CLASS_LABEL[chiave] ?? chiave} <span className="text-muted">({righeGruppo.length})</span>
              </h3>
              <span className="text-xs text-muted">{fmtEur(valoreGruppo)} · {((valoreGruppo / totaleValore) * 100 || 0).toFixed(1)}% del portafoglio</span>
            </button>
            {!collassato && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    {COLONNE.map((col) => (
                      <th key={col.chiave} className={`px-5 py-3 font-semibold ${col.align === "right" ? "text-right" : ""}`}>
                        <button type="button" onClick={() => alternaOrdinamento(col.chiave)} className="inline-flex items-center gap-1 hover:text-ink">
                          {col.label}
                          {ordinamento.chiave === col.chiave && <span>{ordinamento.dir === 1 ? "▲" : "▼"}</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {righeGruppo.map((r) => (
                    <tr key={`${r.conto}-${r.symbol}`} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 font-bold">{r.symbol}</td>
                      <td className="px-5 py-2.5 text-muted">{r.conto}</td>
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
                    <td className="px-5 py-3" colSpan={3}>Subtotale</td>
                    <td className="px-5 py-3 text-right">{fmtEur(costoGruppo)}</td>
                    <td className="px-5 py-3 text-right">{fmtEur(valoreGruppo)}</td>
                    <td className={`px-5 py-3 text-right ${plGruppo >= 0 ? "text-pos" : "text-neg"}`} colSpan={2}>{fmtEur(plGruppo)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}

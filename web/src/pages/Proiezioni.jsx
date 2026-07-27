import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtEur } from "../lib/format.js";
import Card from "../components/Card.jsx";
import { useFilters } from "../context/FiltersContext.jsx";
import { quotaContoIbkr } from "../lib/conto.js";

const ANNI_MAX = 40;
const CATEGORIA_IBKR_TO_CONFIG = { STK: "stock", BOND: "bonds", FUND: "funds", CMDTY: "commodities", CRYPTO: "crypto" };

function calcolaSerie(valoreIniziale, rendimentoPct, contributoMensile, anni) {
  const tassoMensile = Math.pow(1 + rendimentoPct / 100, 1 / 12) - 1;
  const serie = [];
  for (let anno = 0; anno <= anni; anno++) {
    const mesi = anno * 12;
    let valore;
    if (tassoMensile === 0) valore = valoreIniziale + contributoMensile * mesi;
    else valore = valoreIniziale * Math.pow(1 + tassoMensile, mesi) + contributoMensile * ((Math.pow(1 + tassoMensile, mesi) - 1) / tassoMensile);
    serie.push(valore);
  }
  return serie;
}

function ChartSerie({ serie }) {
  const w = 640, h = 220, padY = 12;
  const max = Math.max(...serie, 1);
  const min = Math.min(...serie, 0);
  const range = max - min || 1;
  const pts = serie.map((v, i) => {
    const x = (i / (serie.length - 1 || 1)) * w;
    const y = padY + (1 - (v - min) / range) * (h - 2 * padY);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${line} ${w},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-56 w-full">
      <defs>
        <linearGradient id="gradProiezioni" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B4FF39" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#B4FF39" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#gradProiezioni)" />
      <polyline points={line} fill="none" stroke="#0B0C10" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Proiezioni() {
  const { intestatarioId } = useFilters();
  const [valoreIniziale, setValoreIniziale] = useState(0);
  const [rendimentoPct, setRendimentoPct] = useState(5);
  const [contributoMensile, setContributoMensile] = useState(0);
  const [anni, setAnni] = useState(20);
  const [info, setInfo] = useState("Caricamento...");
  const [statoRendimenti, setStatoRendimenti] = useState("");
  const [ricalcolando, setRicalcolando] = useState(false);

  const caricaDefaultPortafoglio = useCallback(async (intestatarioId) => {
    const quota = await quotaContoIbkr(intestatarioId);
    const [{ data: nav }, { data: rendimentiCategoria }] = await Promise.all([
      supabase.from("conto_nav_giornaliero").select("report_date, cash_eur, total_eur").order("report_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("config_rendimenti_attesi").select("categoria, rendimento_atteso_pct"),
    ]);

    let cagrDefault = 5;
    let valore = 0;
    if (nav && Number(nav.total_eur) > 0) {
      valore = Number(nav.total_eur) * quota;
      const rendimentoPerCategoria = new Map((rendimentiCategoria ?? []).map((r) => [r.categoria, Number(r.rendimento_atteso_pct)]));

      const { data: dataUltima } = await supabase.from("posizioni_aperte_ibkr").select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
      let posizioni = [];
      if (dataUltima) {
        const { data } = await supabase.from("posizioni_aperte_ibkr").select("conid, asset_category, position_value_eur").eq("report_date", dataUltima.report_date);
        posizioni = data ?? [];
      }
      const conidUnici = [...new Set(posizioni.map((p) => p.conid))];
      const { data: strumenti } = conidUnici.length > 0
        ? await supabase.from("tax_instruments").select("conid, rendimento_5y_pct").in("conid", conidUnici)
        : { data: [] };
      const rendimentoPerConid = new Map((strumenti ?? []).map((s) => [s.conid, s.rendimento_5y_pct != null ? Number(s.rendimento_5y_pct) : null]));

      // Nota: la quota si applica ai valori assoluti (valore, sommaPesata), non al
      // CAGR pesato in sé — è un rapporto tra grandezze scalate dello stesso fattore,
      // quindi resta invariato. Scalata comunque per coerenza col resto del calcolo.
      let sommaPesata = Number(nav.cash_eur ?? 0) * quota * (rendimentoPerCategoria.get("cash") ?? 0);
      let nReale = 0, nFallback = 0;
      for (const p of posizioni) {
        const val = Number(p.position_value_eur ?? 0) * quota;
        const reale = rendimentoPerConid.get(p.conid);
        if (reale != null) { sommaPesata += val * reale; nReale++; }
        else { sommaPesata += val * (rendimentoPerCategoria.get(CATEGORIA_IBKR_TO_CONFIG[p.asset_category]) ?? 0); nFallback++; }
      }
      cagrDefault = sommaPesata / valore;
      setInfo(`Valore iniziale dall'ultimo snapshot patrimonio (${nav.report_date}). Rendimento atteso: media pesata per valore di posizione, ${nReale} strumento/i con CAGR storico reale (~5 anni) e ${nFallback} su ipotesi generica per categoria — modificabile liberamente qui sotto.`);
    } else {
      setInfo("Nessuno snapshot patrimonio disponibile: valore iniziale e rendimento di default a 0, inseriscili a mano.");
    }
    return { valore, cagrDefault };
  }, []);

  useEffect(() => {
    if (!intestatarioId) return;
    (async () => {
      const { valore, cagrDefault } = await caricaDefaultPortafoglio(intestatarioId);
      let contributoDefault = 0;
      try {
        const { data } = await supabase.functions.invoke("calcola-budget-sostenibilita", { body: { intestatario_id: intestatarioId } });
        if (data?.risultato) contributoDefault = Math.max(0, Math.round(data.risultato.margineMensile));
      } catch (_) { /* margine non disponibile: default 0 */ }
      setValoreIniziale(Math.round(valore));
      setRendimentoPct(Number(cagrDefault.toFixed(1)));
      setContributoMensile(contributoDefault);
    })();
  }, [caricaDefaultPortafoglio, intestatarioId]);

  async function ricalcolaRendimenti() {
    setRicalcolando(true);
    setStatoRendimenti("Ricalcolo rendimenti storici in corso (può richiedere qualche secondo)...");
    try {
      const { data, error } = await supabase.functions.invoke("calcola-rendimenti-storici", { body: {} });
      if (error) throw error;
      const dettaglio = data.dettaglio ?? {};
      const valori = Object.values(dettaglio);
      const nOk = valori.filter((d) => !d.skipped).length;
      const nSkip = valori.filter((d) => d.skipped).length;
      setStatoRendimenti(`Fatto: ${nOk} strumento/i aggiornati, ${nSkip} saltati (vedi console per il dettaglio).`);
      console.log("calcola-rendimenti-storici:", dettaglio);
      const { cagrDefault } = await caricaDefaultPortafoglio(intestatarioId);
      setRendimentoPct(Number(cagrDefault.toFixed(1)));
    } catch (e) {
      setStatoRendimenti(`Errore: ${e.message}`);
    } finally {
      setRicalcolando(false);
    }
  }

  const serie = calcolaSerie(valoreIniziale, rendimentoPct, contributoMensile, anni);
  const finale = serie[serie.length - 1];
  const versato = valoreIniziale + contributoMensile * anni * 12;

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Proiezioni patrimonio</h2>
      <p className="mb-2 text-sm text-muted">
        Simulazione what-if: valore iniziale, rendimento atteso, contributo mensile e orizzonte — tutti modificabili. Le ipotesi di rendimento sono medie storiche di mercato, non previsioni certe né raccomandazioni su uno strumento specifico.
      </p>
      <p className="mb-4 text-sm text-muted">{info}</p>

      <div className="mb-5 flex items-center gap-3">
        <button onClick={ricalcolaRendimenti} disabled={ricalcolando} className="rounded-chip bg-hero px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {ricalcolando ? "Ricalcolo..." : "Ricalcola rendimenti storici strumenti"}
        </button>
        {statoRendimenti && <span className="text-xs text-muted">{statoRendimenti}</span>}
      </div>

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">
            Valore iniziale (EUR)
            <input type="number" step="100" value={valoreIniziale} onChange={(e) => setValoreIniziale(Number(e.target.value))}
              className="mt-1 w-full rounded-chip border border-line px-3 py-2 text-sm font-normal outline-none focus:border-accent" />
          </label>
          <label className="text-sm font-semibold">
            Contributo mensile (EUR)
            <input type="number" step="10" value={contributoMensile} onChange={(e) => setContributoMensile(Number(e.target.value))}
              className="mt-1 w-full rounded-chip border border-line px-3 py-2 text-sm font-normal outline-none focus:border-accent" />
          </label>
          <label className="text-sm font-semibold">
            Rendimento atteso annuo <span className="font-mono text-accent-ink">{rendimentoPct.toFixed(1)}%</span>
            <input type="range" min={-5} max={15} step={0.1} value={rendimentoPct} onChange={(e) => setRendimentoPct(Number(e.target.value))} className="mt-2 w-full accent-hero" />
          </label>
          <label className="text-sm font-semibold">
            Orizzonte <span className="font-mono text-accent-ink">{anni} anni</span>
            <input type="range" min={1} max={ANNI_MAX} step={1} value={anni} onChange={(e) => setAnni(Number(e.target.value))} className="mt-2 w-full accent-hero" />
          </label>
        </div>
      </Card>

      <p className="mb-4 text-sm">
        Patrimonio proiettato tra {anni} anni: <strong className="font-display text-lg">{fmtEur(finale)}</strong>
        {" "}(di cui versato/iniziale {fmtEur(versato)}, crescita stimata {fmtEur(finale - versato)}).
      </p>

      <Card>
        <ChartSerie serie={serie} />
      </Card>
    </div>
  );
}

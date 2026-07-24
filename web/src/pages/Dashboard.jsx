import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtEur, fmtPct } from "../lib/format.js";
import Card from "../components/Card.jsx";

// Stesso intestatario hardcoded del sito vanilla (js/client/budget.js, proiezioni.js):
// unico con buste paga caricate oggi. Da sostituire con un selettore se in futuro
// anche un secondo intestatario avra' introiti propri.
const INTESTATARIO_ID = "37af7f90-79d8-42e6-b172-367ccbd38846";
const RENDIMENTO_CATEGORIE = ["cash", "stock", "bonds", "funds", "commodities", "crypto"];
const CATEGORIA_LABEL = {
  luce: "Luce", internet_telefono: "Internet", affitto: "Affitto", condominio: "Condominio",
  streaming: "Streaming", software: "Software", fitness: "Fitness", veicolo: "Veicolo",
  assicurazione: "Assicurazione", bancario: "Bancario", altro: "Altro",
};
const GIUDIZIO_LABEL = { sostenibile: "Sostenibile", attenzione: "Attenzione", rischio: "A rischio" };

function buildSparkPoints(series, w = 300, h = 80, padY = 6) {
  if (series.length < 2) return { line: "", area: "" };
  const values = series.map((s) => s.total_eur);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = padY + (1 - (v - min) / range) * (h - 2 * padY);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${line} ${w},${h} 0,${h}`;
  return { line, area };
}

function calcolaSerieCrescita(valoreIniziale, rendimentoPct, contributoMensile, anni) {
  const tassoMensile = Math.pow(1 + rendimentoPct / 100, 1 / 12) - 1;
  const mesi = anni * 12;
  if (tassoMensile === 0) return valoreIniziale + contributoMensile * mesi;
  return valoreIniziale * Math.pow(1 + tassoMensile, mesi) + contributoMensile * ((Math.pow(1 + tassoMensile, mesi) - 1) / tassoMensile);
}

export default function Dashboard() {
  const [stato, setStato] = useState("loading");
  const [dati, setDati] = useState(null);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const [navQ, rendimentiQ, eventiQ, budgetRes] = await Promise.all([
          supabase.from("conto_nav_giornaliero")
            .select("report_date, cash_eur, stock_eur, bonds_eur, funds_eur, commodities_eur, crypto_eur, total_eur")
            .order("report_date", { ascending: false }).limit(44),
          supabase.from("config_rendimenti_attesi").select("categoria, rendimento_atteso_pct"),
          supabase.from("tax_events").select("anno, imposta_eur"),
          supabase.functions.invoke("calcola-budget-sostenibilita", { body: { intestatario_id: INTESTATARIO_ID } }),
        ]);

        const navSerie = (navQ.data ?? []).slice().reverse();
        const ultimaPosQ = await supabase.from("posizioni_aperte_ibkr").select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
        let holdings = [];
        if (ultimaPosQ.data) {
          const { data } = await supabase.from("posizioni_aperte_ibkr")
            .select("conid, symbol, position_value_eur").eq("report_date", ultimaPosQ.data.report_date)
            .order("position_value_eur", { ascending: false });
          holdings = data ?? [];
        }

        if (!annullato) {
          setDati({
            navSerie,
            holdings,
            rendimentiCategoria: rendimentiQ.data ?? [],
            eventiFiscali: eventiQ.data ?? [],
            budget: budgetRes.data?.risultato ?? null,
          });
          setStato("ready");
        }
      } catch (e) {
        console.error(e);
        if (!annullato) setStato("error");
      }
    })();
    return () => { annullato = true; };
  }, []);

  if (stato === "loading") return <p className="text-sm text-muted">Caricamento...</p>;
  if (stato === "error" || !dati) return <p className="text-sm text-neg">Errore nel caricamento dei dati.</p>;

  const { navSerie, holdings, rendimentiCategoria, eventiFiscali, budget } = dati;
  const ultima = navSerie[navSerie.length - 1];
  const prima = navSerie[0];
  const patrimonioTotale = ultima ? Number(ultima.total_eur) : 0;
  const deltaPct = ultima && prima ? ((Number(ultima.total_eur) - Number(prima.total_eur)) / Number(prima.total_eur)) * 100 : 0;
  const portafoglioValore = ultima ? Number(ultima.stock_eur) + Number(ultima.bonds_eur) : 0;
  const alloc = ultima
    ? {
        azionario: (Number(ultima.stock_eur) / patrimonioTotale) * 100,
        obbligazionario: (Number(ultima.bonds_eur) / patrimonioTotale) * 100,
        liquidita: (Number(ultima.cash_eur) / patrimonioTotale) * 100,
      }
    : { azionario: 0, obbligazionario: 0, liquidita: 0 };

  const { line, area } = buildSparkPoints(navSerie);

  const rendimentoPerCategoria = new Map(rendimentiCategoria.map((r) => [r.categoria, Number(r.rendimento_atteso_pct)]));
  let cagrBlend = 5;
  if (ultima && patrimonioTotale > 0) {
    let somma = 0;
    for (const cat of RENDIMENTO_CATEGORIE) {
      somma += Number(ultima[`${cat}_eur`] ?? 0) * (rendimentoPerCategoria.get(cat) ?? 0);
    }
    cagrBlend = somma / patrimonioTotale;
  }
  const margineMensile = budget?.margineMensile ?? 0;
  const proiezione10y = calcolaSerieCrescita(patrimonioTotale, cagrBlend, Math.max(0, margineMensile), 10);

  const impostePerAnno = new Map();
  for (const e of eventiFiscali) impostePerAnno.set(e.anno, (impostePerAnno.get(e.anno) ?? 0) + Number(e.imposta_eur));
  const anniConDati = [...impostePerAnno.keys()].sort((a, b) => b - a);
  const annoRecente = anniConDati.find((a) => a !== new Date().getFullYear()) ?? anniConDati[0];
  const impostaAnnoRecente = annoRecente != null ? impostePerAnno.get(annoRecente) : null;

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Ciao, Mattia</h2>
        <span className="text-sm text-muted">
          {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>

      <section className="mb-4 grid grid-cols-1 items-center gap-5 rounded-card bg-hero p-7 text-white sm:grid-cols-[1fr_auto]">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-hero-muted">Patrimonio netto</p>
          <p className="font-display text-4xl font-extrabold tracking-tight">{fmtEur(patrimonioTotale)}</p>
          <span className={`mt-2 inline-flex items-center gap-1 text-sm font-bold ${deltaPct < 0 ? "text-[#FF9C86]" : "text-accent"}`}>
            {deltaPct < 0 ? "▼" : "▲"} {fmtPct(Math.abs(deltaPct))} nell'ultimo periodo osservato
          </span>
          <div className="mt-4 flex gap-5 text-xs text-hero-muted">
            <div>Azionario<strong className="block text-sm text-white">{fmtPct(alloc.azionario)}</strong></div>
            <div>Obbligazionario<strong className="block text-sm text-white">{fmtPct(alloc.obbligazionario)}</strong></div>
            <div>Liquidità<strong className="block text-sm text-white">{fmtPct(alloc.liquidita)}</strong></div>
          </div>
        </div>
        <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="h-20 w-full sm:w-[220px]">
          <defs>
            <linearGradient id="gradHero" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B4FF39" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#B4FF39" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#gradHero)" />
          <polyline points={line} fill="none" stroke="#B4FF39" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-1 font-display text-base font-bold">Portafoglio</h3>
          <p className="mb-4 text-xs text-muted">{holdings.length} posizioni aperte · IBKR</p>
          <p className="mb-3.5 font-display text-2xl font-extrabold tracking-tight">{fmtEur(portafoglioValore)}</p>
          <div className="mb-3.5 flex h-[7px] overflow-hidden rounded-full bg-line">
            <span className="bg-hero" style={{ width: `${alloc.azionario}%` }} />
            <span className="bg-accent" style={{ width: `${alloc.obbligazionario}%` }} />
            <span className="bg-line" style={{ width: `${alloc.liquidita}%` }} />
          </div>
          <ul className="divide-y divide-line">
            {holdings.slice(0, 4).map((h) => (
              <li key={h.conid} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-bold">{h.symbol ?? h.conid}</span>
                <span className="font-semibold">{fmtEur(Number(h.position_value_eur))}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-1 font-display text-base font-bold">Utenze</h3>
          <p className="mb-4 text-xs text-muted">Costi fissi reali · analisi principale</p>
          {budget ? (
            <>
              <p className="mb-3.5 font-display text-2xl font-extrabold tracking-tight">
                {fmtEur(budget.costiFissiMensiliTotali)}
                <span className="ml-1 text-sm font-semibold text-muted">/mese</span>
              </p>
              <ul className="space-y-2.5">
                {[...budget.costiPerCategoria].sort((a, b) => b.costoMensileEquivalente - a.costoMensileEquivalente).map((c) => (
                  <li key={c.categoria} className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</span>
                    <span className="font-bold">{fmtEur(c.costoMensileEquivalente)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Nessun dato disponibile.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold">Budget</h4>
            <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-warn-ink">Extra</span>
          </div>
          {budget ? (
            <>
              <div className="font-display text-xl font-extrabold">{fmtPct(budget.rapportoPct)}</div>
              <p className="mt-1 text-xs text-muted">
                <span className="rounded-full bg-pos-bg px-2 py-0.5 font-bold text-pos">{GIUDIZIO_LABEL[budget.giudizio]}</span>
                {" "}margine {fmtEur(budget.margineMensile)}/mese
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">n/d</p>
          )}
        </Card>
        <Card>
          <h4 className="mb-2 text-sm font-bold">Proiezioni</h4>
          <div className="font-display text-xl font-extrabold">≈ {fmtEur(proiezione10y)}</div>
          <p className="mt-1 text-xs text-muted">tra 10 anni, a queste condizioni</p>
        </Card>
        <Card>
          <h4 className="mb-2 text-sm font-bold">Fiscale</h4>
          <div className="font-display text-xl font-extrabold">{impostaAnnoRecente != null ? fmtEur(impostaAnnoRecente) : "n/d"}</div>
          <p className="mt-1 text-xs text-muted">{annoRecente ? `imposte stimate ${annoRecente}` : ""}</p>
        </Card>
      </div>
    </div>
  );
}

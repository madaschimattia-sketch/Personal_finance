import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { fmtEur, fmtPct } from "../lib/format.js";
import Card from "../components/Card.jsx";
import { useFilters } from "../context/FiltersContext.jsx";
import { CATEGORIA_LABEL } from "../lib/categorie.js";
import { quotaContoIbkr, contoIdIbkr } from "../lib/conto.js";
import { caricaPosizioniBancaGenerali } from "../lib/bancaGenerali.js";
import { caricaPosizioniWidiba } from "../lib/widiba.js";
import { caricaPosizioniBgSaxo } from "../lib/bgSaxo.js";

const RENDIMENTO_CATEGORIE = ["cash", "stock", "bonds", "funds", "commodities", "crypto"];
const GIUDIZIO_LABEL = { sostenibile: "Sostenibile", attenzione: "Attenzione", rischio: "A rischio" };

// Stessa tassonomia normalizzata di Portafoglio.jsx (vedi migration 0031):
// l'allocazione qui va allineata a quella, non ricavata dai bucket grezzi IBKR
// stock_eur/bonds_eur/cash_eur di conto_nav_giornaliero (quelli mischiano
// Commodities/Alternative/Real Estate dentro "stock" perche' IBKR li classifica
// tutti come STK).
const ASSET_CLASS_LABEL = {
  Equity: "Azionario", "Fixed Income": "Obbligazionario", Commodities: "Materie prime",
  "Real Estate": "Immobiliare", Alternative: "Alternativo", "Multi-Asset": "Multi-asset",
  Liquidity: "Liquidità", Other: "Altro",
};
const ASSET_CLASS_ORDER = ["Equity", "Fixed Income", "Real Estate", "Commodities", "Alternative", "Multi-Asset", "Liquidity", "Other"];
const ASSET_CLASS_COLOR = {
  Equity: "bg-hero", "Fixed Income": "bg-hero/55", Commodities: "bg-accent", "Real Estate": "bg-accent/55",
  Alternative: "bg-ink/35", "Multi-Asset": "bg-ink/20", Liquidity: "bg-line", Other: "bg-muted/40",
};

function calcolaSerieCrescita(valoreIniziale, rendimentoPct, contributoMensile, anni) {
  const tassoMensile = Math.pow(1 + rendimentoPct / 100, 1 / 12) - 1;
  const mesi = anni * 12;
  if (tassoMensile === 0) return valoreIniziale + contributoMensile * mesi;
  return valoreIniziale * Math.pow(1 + tassoMensile, mesi) + contributoMensile * ((Math.pow(1 + tassoMensile, mesi) - 1) / tassoMensile);
}

function fmtDataBreve(iso) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

// Sparkline patrimonio con crosshair: overlay trasparente cattura il mousemove e
// mappa la posizione X alla data più vicina nella serie, mostra un tooltip con
// data + valore (pattern hover coerente con BarChart/LineChart di Casa.jsx).
function HeroChart({ series }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const w = 300, h = 80, padY = 6;

  if (series.length < 2) {
    return <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full sm:h-56" />;
  }

  const values = series.map((s) => Number(s.total_eur));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
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
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-surface px-2.5 py-1 text-xs font-bold text-ink shadow-card"
          style={{ left: `${(pts[hoverIdx].x / w) * 100}%`, top: `${Math.max(0, (pts[hoverIdx].y / h) * 100)}%` }}
        >
          <div>{fmtDataBreve(series[hoverIdx].report_date)}</div>
          <div>{fmtEur(values[hoverIdx])}</div>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-40 w-full sm:h-56"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="gradHero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B4FF39" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#B4FF39" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#gradHero)" />
        <polyline points={line} fill="none" stroke="#B4FF39" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx !== null && (
          <>
            <line x1={pts[hoverIdx].x} y1={0} x2={pts[hoverIdx].x} y2={h} stroke="#B4FF39" strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
            <circle cx={pts[hoverIdx].x} cy={pts[hoverIdx].y} r="4" fill="#B4FF39" stroke="#0B0C10" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  );
}

// Barra orizzontale di allocazione per asset class, con tooltip hover per segmento.
function AllocationBar({ gruppi }) {
  const [hover, setHover] = useState(null);
  let acc = 0;
  const segmenti = gruppi.map((g) => {
    const centro = acc + g.pct / 2;
    acc += g.pct;
    return { ...g, centroPct: centro };
  });

  return (
    <div className="relative mb-3.5">
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1 text-xs font-bold text-white"
          style={{ left: `${hover.centroPct}%`, top: "-4px" }}
        >
          {hover.label}: {fmtPct(hover.pct)} · {fmtEur(hover.valore)}
        </div>
      )}
      <div className="flex h-[7px] overflow-hidden rounded-full bg-line">
        {segmenti.map((g) => (
          <span
            key={g.chiave}
            className={ASSET_CLASS_COLOR[g.chiave] ?? "bg-muted/40"}
            style={{ width: `${g.pct}%` }}
            onMouseEnter={() => setHover(g)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
    </div>
  );
}

// Grafico riassuntivo delle spese ricorrenti per categoria: barre orizzontali
// proporzionate al costo mensile equivalente, con tooltip hover.
function SpeseRicorrentiChart({ categorie }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...categorie.map((c) => c.costoMensileEquivalente), 1);
  return (
    <div className="space-y-2">
      {categorie.map((c) => (
        <div
          key={c.categoria}
          className="relative"
          onMouseEnter={() => setHover(c.categoria)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="mb-0.5 flex items-center justify-between text-sm">
            <span className="font-semibold">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</span>
            <span className="font-bold">{fmtEur(c.costoMensileEquivalente)}</span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-all ${hover === c.categoria ? "bg-hero" : "bg-ink/70"}`}
              style={{ width: `${(c.costoMensileEquivalente / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { intestatari, intestatarioId, periodoGiorni } = useFilters();
  const [stato, setStato] = useState("loading");
  const [dati, setDati] = useState(null);

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        let cutoff = null;
        if (periodoGiorni) {
          const d = new Date();
          d.setDate(d.getDate() - periodoGiorni);
          cutoff = d.toISOString().slice(0, 10);
        }
        let navQuery = supabase.from("conto_nav_giornaliero")
          .select("report_date, cash_eur, stock_eur, bonds_eur, funds_eur, commodities_eur, crypto_eur, total_eur")
          .order("report_date", { ascending: true });
        if (cutoff) navQuery = navQuery.gte("report_date", cutoff);

        const [navQ, rendimentiQ, eventiQ, budgetRes, lottiQ, strumentiQ, fondiQ, quota, contoId, posizioniBancaGenerali, posizioniWidiba, posizioniBgSaxo] = await Promise.all([
          navQuery,
          supabase.from("config_rendimenti_attesi").select("categoria, rendimento_atteso_pct"),
          supabase.from("tax_events").select("anno, imposta_eur"),
          supabase.functions.invoke("calcola-budget-sostenibilita", { body: { intestatario_id: intestatarioId } }),
          supabase.from("tax_lots").select("instrument_id, quantita_residua").eq("stato", "aperto"),
          supabase.from("tax_instruments").select("id, symbol, descrizione, asset_class, isin, conid"),
          supabase.from("fondi_pensione").select("id").eq("intestatario_id", intestatarioId),
          quotaContoIbkr(intestatarioId),
          contoIdIbkr(),
          caricaPosizioniBancaGenerali(intestatarioId),
          caricaPosizioniWidiba(intestatarioId),
          caricaPosizioniBgSaxo(intestatarioId),
        ]);

        // Conto IBKR cointestato: ogni valore in EUR va scalato alla quota
        // dell'intestatario selezionato (vedi lib/conto.js). Con quota 0 (es.
        // Martina, che non è cointestataria) non basta azzerare gli importi: le
        // righe/posizioni sono comunque quelle di un altro intestatario e non
        // devono comparire affatto, quindi qui si azzerano le liste intere.
        const CAMPI_EUR_NAV = ["cash_eur", "stock_eur", "bonds_eur", "funds_eur", "commodities_eur", "crypto_eur", "total_eur"];
        const navSerie = quota === 0 ? [] : (navQ.data ?? []).map((n) => {
          const scalato = { ...n };
          for (const campo of CAMPI_EUR_NAV) scalato[campo] = Number(n[campo]) * quota;
          return scalato;
        });

        let posizioni = [];
        if (quota > 0 && contoId) {
          const ultimaPosQ = await supabase.from("posizioni_aperte_ibkr").select("report_date").eq("conto_id", contoId).order("report_date", { ascending: false }).limit(1).maybeSingle();
          if (ultimaPosQ.data) {
            const { data } = await supabase.from("posizioni_aperte_ibkr")
              .select("conid, isin, symbol, position_value_eur").eq("conto_id", contoId).eq("report_date", ultimaPosQ.data.report_date)
              .order("position_value_eur", { ascending: false });
            posizioni = (data ?? []).map((p) => ({ ...p, position_value_eur: Number(p.position_value_eur) * quota }));
          }
        }

        const idFondi = (fondiQ.data ?? []).map((f) => f.id);
        let posizioniFondi = [];
        if (idFondi.length > 0) {
          const { data } = await supabase.from("fondo_pensione_posizione")
            .select("fondo_id, data_valorizzazione, controvalore_eur").in("fondo_id", idFondi)
            .order("data_valorizzazione", { ascending: false });
          posizioniFondi = data ?? [];
        }

        if (!annullato) {
          setDati({
            navSerie,
            posizioni,
            posizioniFondi,
            posizioniBancaGenerali,
            posizioniWidiba,
            posizioniBgSaxo,
            lotti: quota === 0 ? [] : (lottiQ.data ?? []),
            strumenti: strumentiQ.data ?? [],
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
  }, [intestatarioId, periodoGiorni]);

  if (stato === "loading" || !intestatarioId) return <p className="text-sm text-muted">Caricamento...</p>;
  if (stato === "error" || !dati) return <p className="text-sm text-neg">Errore nel caricamento dei dati.</p>;

  const { navSerie, posizioni, posizioniFondi, posizioniBancaGenerali, posizioniWidiba, posizioniBgSaxo, lotti, strumenti, rendimentiCategoria, eventiFiscali, budget } = dati;
  const ultima = navSerie[navSerie.length - 1];
  const prima = navSerie[0];
  const patrimonioIbkr = ultima ? Number(ultima.total_eur) : 0;

  // Ultimo controvalore noto per fondo (posizioniFondi è ordinata desc: la prima
  // occorrenza per fondo_id è la più recente) — fondi pensione tenuti separati
  // dall'allocazione del portafoglio investito (illiquidi/vincolati), ma sommati
  // al patrimonio netto complessivo.
  const controvaloreFondoPerId = new Map();
  for (const p of posizioniFondi) {
    if (!controvaloreFondoPerId.has(p.fondo_id)) controvaloreFondoPerId.set(p.fondo_id, Number(p.controvalore_eur));
  }
  const fondoPensioneTotale = [...controvaloreFondoPerId.values()].reduce((s, v) => s + v, 0);
  const valoreBancaGeneraliTotale = posizioniBancaGenerali.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
  const valoreWidibaTotale = posizioniWidiba.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
  const valoreBgSaxoTotale = posizioniBgSaxo.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
  const patrimonioTotale = patrimonioIbkr + fondoPensioneTotale + valoreBancaGeneraliTotale + valoreWidibaTotale + valoreBgSaxoTotale;

  const deltaPct = ultima && prima ? ((Number(ultima.total_eur) - Number(prima.total_eur)) / Number(prima.total_eur)) * 100 : 0;

  const strumentoPerId = new Map(strumenti.map((s) => [s.id, s]));
  const strumentoPerIsin = new Map(strumenti.filter((s) => s.isin).map((s) => [s.isin, s]));
  const strumentoPerConid = new Map(strumenti.map((s) => [s.conid, s]));
  const posPerIsin = new Map(posizioni.filter((p) => p.isin).map((p) => [p.isin, p]));
  const posPerConid = new Map(posizioni.map((p) => [p.conid, p]));
  const idPossessi = new Set(lotti.filter((l) => Number(l.quantita_residua) > 0).map((l) => l.instrument_id));

  const valorePerClasse = new Map();
  for (const id of idPossessi) {
    const strumento = strumentoPerId.get(id);
    const posizione = strumento?.isin ? posPerIsin.get(strumento.isin) : posPerConid.get(strumento?.conid);
    const valore = posizione ? Number(posizione.position_value_eur) : 0;
    const chiave = strumento?.asset_class ?? "Other";
    valorePerClasse.set(chiave, (valorePerClasse.get(chiave) ?? 0) + valore);
  }
  const cashEur = ultima ? Number(ultima.cash_eur) : 0;
  valorePerClasse.set("Liquidity", (valorePerClasse.get("Liquidity") ?? 0) + cashEur);
  // Conti Banca Generali/Widiba: vere asset class di portafoglio (Equity/Fixed
  // Income/Commodities), quindi confluiscono nella stessa allocazione
  // dell'IBKR — a differenza del fondo pensione, tenuto volutamente fuori
  // (illiquido/vincolato).
  for (const r of [...posizioniBancaGenerali, ...posizioniWidiba, ...posizioniBgSaxo]) {
    const chiave = r.assetClass ?? "Other";
    valorePerClasse.set(chiave, (valorePerClasse.get(chiave) ?? 0) + (r.valoreAttuale ?? 0));
  }
  const totalePosizioni = [...valorePerClasse.values()].reduce((s, v) => s + v, 0);
  // Il fallback a 1 serve SOLO per evitare una divisione per zero nel calcolo
  // delle percentuali sotto — il valore mostrato in "Portafoglio" resta il vero
  // totalePosizioni (0 quando l'intestatario non ha quota sul conto, non 1).
  const totalePerPct = totalePosizioni || 1;
  const allocGruppi = ASSET_CLASS_ORDER
    .filter((chiave) => valorePerClasse.has(chiave))
    .map((chiave) => ({
      chiave,
      label: ASSET_CLASS_LABEL[chiave] ?? chiave,
      valore: valorePerClasse.get(chiave),
      pct: (valorePerClasse.get(chiave) / totalePerPct) * 100,
    }));
  // La liquidità IBKR fa parte a tutti gli effetti del portafoglio investito (non
  // è "fuori" come i fondi pensione): il valore del portafoglio include cashEur
  // e ora anche il conto Banca Generali.
  const portafoglioValore = totalePosizioni;

  const rendimentoPerCategoria = new Map(rendimentiCategoria.map((r) => [r.categoria, Number(r.rendimento_atteso_pct)]));
  let cagrBlend = 5;
  if (ultima && patrimonioIbkr > 0) {
    let somma = 0;
    for (const cat of RENDIMENTO_CATEGORIE) {
      somma += Number(ultima[`${cat}_eur`] ?? 0) * (rendimentoPerCategoria.get(cat) ?? 0);
    }
    cagrBlend = somma / patrimonioIbkr;
  }
  const margineMensile = budget?.margineMensile ?? 0;
  const proiezione10y = calcolaSerieCrescita(patrimonioIbkr, cagrBlend, Math.max(0, margineMensile), 10);

  const impostePerAnno = new Map();
  for (const e of eventiFiscali) impostePerAnno.set(e.anno, (impostePerAnno.get(e.anno) ?? 0) + Number(e.imposta_eur));
  const anniConDati = [...impostePerAnno.keys()].sort((a, b) => b - a);
  const annoRecente = anniConDati.find((a) => a !== new Date().getFullYear()) ?? anniConDati[0];
  const impostaAnnoRecente = annoRecente != null ? impostePerAnno.get(annoRecente) : null;

  const periodoLabel = prima && ultima && prima.report_date !== ultima.report_date
    ? `dal ${fmtDataBreve(prima.report_date)} al ${fmtDataBreve(ultima.report_date)}`
    : "";

  const top5Ibkr = posizioni.map((h) => {
    const strumento = h.isin ? strumentoPerIsin.get(h.isin) : strumentoPerConid.get(h.conid);
    return { chiave: h.conid, nome: strumento?.descrizione ?? h.symbol ?? h.conid, valore: Number(h.position_value_eur) };
  });
  const top5BancaGenerali = posizioniBancaGenerali.map((r) => ({ chiave: r.isin, nome: r.symbol, valore: r.valoreAttuale ?? 0 }));
  const top5Widiba = posizioniWidiba.map((r) => ({ chiave: r.isin, nome: r.symbol, valore: r.valoreAttuale ?? 0 }));
  const top5BgSaxo = posizioniBgSaxo.map((r) => ({ chiave: r.isin, nome: r.symbol, valore: r.valoreAttuale ?? 0 }));
  const top5 = [...top5Ibkr, ...top5BancaGenerali, ...top5Widiba, ...top5BgSaxo].sort((a, b) => b.valore - a.valore).slice(0, 5);

  const nomeSelezionato = intestatari.find((i) => i.id === intestatarioId)?.nome ?? "";

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Ciao, {nomeSelezionato}</h2>
        <span className="text-sm text-muted">
          {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>

      <section className="mb-4 rounded-card bg-hero p-7 text-white">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-hero-muted">Patrimonio netto</p>
            <p className="font-display text-4xl font-extrabold tracking-tight">{fmtEur(patrimonioTotale)}</p>
            <span className={`mt-2 inline-flex items-center gap-1 text-sm font-bold ${deltaPct < 0 ? "text-[#FF9C86]" : "text-accent"}`}>
              {deltaPct < 0 ? "▼" : "▲"} {fmtPct(Math.abs(deltaPct))} {periodoLabel}
            </span>
            {fondoPensioneTotale > 0 && (
              <p className="mt-2 text-xs text-hero-muted">
                di cui <Link to="/investimenti/fondi-pensione" className="underline">Fondo Pensione</Link>: <span className="font-semibold text-white">{fmtEur(fondoPensioneTotale)}</span> (non incluso nell'allocazione sotto)
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-hero-muted">
            {allocGruppi.map((g) => (
              <div key={g.chiave}>
                {g.label}
                <strong className="block text-sm text-white">{fmtPct(g.pct)}</strong>
              </div>
            ))}
          </div>
        </div>
        <HeroChart series={navSerie} />
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link to="/investimenti/portafoglio" className="block">
          <Card className="transition-shadow hover:shadow-lg">
            <h3 className="mb-1 font-display text-base font-bold">Portafoglio</h3>
            <p className="mb-4 text-xs text-muted">
              {posizioni.length + posizioniBancaGenerali.length + posizioniWidiba.length + posizioniBgSaxo.length} posizioni aperte + liquidità · IBKR
              {posizioniBancaGenerali.length > 0 ? " + Banca Generali" : ""}
              {posizioniWidiba.length > 0 ? " + Widiba" : ""}
              {posizioniBgSaxo.length > 0 ? " + BG Saxo" : ""}
            </p>
            <p className="mb-3.5 font-display text-2xl font-extrabold tracking-tight">{fmtEur(portafoglioValore)}</p>
            <AllocationBar gruppi={allocGruppi} />
            <ul className="divide-y divide-line">
              {top5.map((h) => (
                <li key={h.chiave} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="truncate font-bold">{h.nome}</span>
                  <span className="shrink-0 font-semibold">{fmtEur(h.valore)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Link>

        <Link to="/spese-ricorrenti" className="block">
          <Card className="transition-shadow hover:shadow-lg">
            <h3 className="mb-1 font-display text-base font-bold">Spese ricorrenti</h3>
            <p className="mb-4 text-xs text-muted">Costi fissi reali · analisi principale</p>
            {budget ? (
              <>
                <p className="mb-3.5 font-display text-2xl font-extrabold tracking-tight">
                  {fmtEur(budget.costiFissiMensiliTotali)}
                  <span className="ml-1 text-sm font-semibold text-muted">/mese</span>
                </p>
                <SpeseRicorrentiChart categorie={[...budget.costiPerCategoria].sort((a, b) => b.costoMensileEquivalente - a.costoMensileEquivalente)} />
              </>
            ) : (
              <p className="text-sm text-muted">Nessun dato disponibile.</p>
            )}
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link to="/budget" className="block">
          <Card className="transition-shadow hover:shadow-lg">
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
        </Link>
        <Link to="/proiezioni" className="block">
          <Card className="transition-shadow hover:shadow-lg">
            <h4 className="mb-2 text-sm font-bold">Proiezioni</h4>
            <div className="font-display text-xl font-extrabold">≈ {fmtEur(proiezione10y)}</div>
            <p className="mt-1 text-xs text-muted">tra 10 anni, a queste condizioni</p>
          </Card>
        </Link>
        <Link to="/investimenti/fiscale" className="block">
          <Card className="transition-shadow hover:shadow-lg">
            <h4 className="mb-2 text-sm font-bold">Fiscale</h4>
            <div className="font-display text-xl font-extrabold">{impostaAnnoRecente != null ? fmtEur(impostaAnnoRecente) : "n/d"}</div>
            <p className="mt-1 text-xs text-muted">{annoRecente ? `imposte stimate ${annoRecente}` : ""}</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}

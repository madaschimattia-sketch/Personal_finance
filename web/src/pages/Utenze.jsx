import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtEur } from "../lib/format.js";
import Card from "../components/Card.jsx";

// Vista sulle utenze GIA' IN ESSERE (bollette reali + spese fisse manuali) — non e'
// la vista di sostenibilita' (quella e' "Budget", volutamente secondaria). Qui si
// guarda cosa e' stato pagato/e' attivo, non una proiezione.
//
// Sezione "Energia": unica categoria con vera variabilita' mese su mese (importo E
// consumo kWh su ogni bolletta A2A) — internet e' fisso, affitto/condominio non sono
// a cadenza mensile. Due grafici separati (costo, consumo) invece di un combo a doppio
// asse — un dual-axis mischia due scale diverse ed e' l'errore #1 da evitare in un
// grafico. Periodi bimestrali REALI (mai split mensile finto) per non inventare
// precisione che i dati non hanno.
const CATEGORIA_LABEL = {
  gas: "Gas", acqua: "Acqua", internet_telefono: "Internet/telefono",
  affitto: "Affitto", condominio: "Condominio", streaming: "Streaming", software: "Software",
  fitness: "Fitness", veicolo: "Veicolo", assicurazione: "Assicurazione", bancario: "Bancario", altro: "Altro",
};
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function etichettaPeriodo(periodoDa, periodoA) {
  const da = new Date(periodoDa);
  const a = periodoA ? new Date(periodoA) : null;
  const daTxt = `${MESI[da.getMonth()]}`;
  if (a && a.getMonth() !== da.getMonth()) {
    return `${daTxt}-${MESI[a.getMonth()]} '${String(da.getFullYear()).slice(2)}`;
  }
  return `${daTxt} '${String(da.getFullYear()).slice(2)}`;
}

function BarChart({ dati, formatValue, color = "#0B0C10" }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 200, padY = 10;
  const max = Math.max(...dati.map((d) => d.value), 1);
  const slot = w / dati.length;
  const barW = Math.max(6, slot - 10);
  return (
    <div className="relative">
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-chip bg-hero px-2.5 py-1 text-xs font-bold text-white"
          style={{ left: `${((hover + 0.5) / dati.length) * 100}%`, top: `${((h - (dati[hover].value / max) * (h - padY)) / (h + 24)) * 100}%` }}
        >
          {dati[hover].label}: {formatValue(dati[hover].value)}
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" className="h-52 w-full">
        {dati.map((d, i) => {
          const barH = (d.value / max) * (h - padY);
          const x = i * slot + (slot - barW) / 2;
          const y = h - barH;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={barH} rx={4} fill={color}
                opacity={hover === null || hover === i ? 1 : 0.35}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              />
              <text x={x + barW / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineChart({ dati, formatValue, color = "#B4FF39", strokeInk = false }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 200, padY = 14;
  const values = dati.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const slot = w / (dati.length - 1 || 1);
  const pts = dati.map((d, i) => ({ x: i * slot, y: padY + (1 - (d.value - min) / range) * (h - 2 * padY) }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="relative">
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-chip bg-hero px-2.5 py-1 text-xs font-bold text-white"
          style={{ left: `${(pts[hover].x / w) * 100}%`, top: `${(pts[hover].y / (h + 24)) * 100}%` }}
        >
          {dati[hover].label}: {formatValue(dati[hover].value)}
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" className="h-52 w-full">
        <polyline points={line} fill="none" stroke={strokeInk ? "#0B0C10" : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill={strokeInk ? "#0B0C10" : color}
            stroke="#FFFFFF" strokeWidth="1.5"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          />
        ))}
        {dati.map((d, i) => (
          <text key={i} x={pts[i].x} y={h + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

export default function Utenze() {
  const [stato, setStato] = useState("loading");
  const [bollette, setBollette] = useState([]);
  const [luce, setLuce] = useState([]);
  const [speseFisse, setSpeseFisse] = useState([]);
  const [domicili, setDomicili] = useState(new Map());

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const [bolletteQ, luceQ, speseQ, domiciliQ] = await Promise.all([
          supabase.from("utenze_bollette")
            .select("categoria, fornitore, importo, data_emissione, frequenza, domicilio_id")
            .neq("categoria", "luce")
            .order("data_emissione", { ascending: false }),
          supabase.from("utenze_bollette")
            .select("periodo_da, periodo_a, importo, consumo, unita_misura")
            .eq("categoria", "luce")
            .order("periodo_da", { ascending: true }),
          supabase.from("spese_fisse_manuali")
            .select("nome, categoria, importo, frequenza, attivo, data_inizio")
            .order("categoria"),
          supabase.from("domicili").select("id, nome"),
        ]);
        if (bolletteQ.error) throw bolletteQ.error;
        if (luceQ.error) throw luceQ.error;
        if (speseQ.error) throw speseQ.error;

        if (!annullato) {
          setBollette(bolletteQ.data ?? []);
          setLuce(luceQ.data ?? []);
          setSpeseFisse(speseQ.data ?? []);
          setDomicili(new Map((domiciliQ.data ?? []).map((d) => [d.id, d.nome])));
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
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento delle utenze.</p>;

  const perCategoria = new Map();
  for (const b of bollette) {
    const arr = perCategoria.get(b.categoria) ?? [];
    arr.push(b);
    perCategoria.set(b.categoria, arr);
  }

  const speseTotaliLuce = luce.reduce((s, b) => s + Number(b.importo), 0);
  const consumoTotaleLuce = luce.reduce((s, b) => s + Number(b.consumo ?? 0), 0);
  const costoUnitarioMedio = consumoTotaleLuce > 0 ? speseTotaliLuce / consumoTotaleLuce : null;
  const ultimaLuce = luce[luce.length - 1];

  const datiCosto = luce.map((b) => ({ label: etichettaPeriodo(b.periodo_da, b.periodo_a), value: Number(b.importo) }));
  const datiConsumo = luce.map((b) => ({ label: etichettaPeriodo(b.periodo_da, b.periodo_a), value: Number(b.consumo ?? 0) }));
  const datiCostoUnitario = luce
    .filter((b) => Number(b.consumo) > 0)
    .map((b) => ({ label: etichettaPeriodo(b.periodo_da, b.periodo_a), value: Number(b.importo) / Number(b.consumo) }));

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Utenze</h2>
      <p className="mb-6 text-sm text-muted">
        Bollette e costi fissi già in essere — l'analisi guarda a ciò che è stato pagato o è attivo oggi, non a una proiezione.
        Per il giudizio di sostenibilità rispetto al reddito vedi <span className="font-semibold">Budget</span>.
      </p>

      <h3 className="mb-3 font-display text-base font-bold">Energia — luce</h3>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><p className="mb-1 text-xs font-semibold text-muted">Spesa totale</p><p className="font-display text-lg font-extrabold">{fmtEur(speseTotaliLuce)}</p></Card>
        <Card><p className="mb-1 text-xs font-semibold text-muted">Consumo totale</p><p className="font-display text-lg font-extrabold">{consumoTotaleLuce.toLocaleString("it-IT")} kWh</p></Card>
        <Card><p className="mb-1 text-xs font-semibold text-muted">Costo unitario medio</p><p className="font-display text-lg font-extrabold">{costoUnitarioMedio !== null ? `${costoUnitarioMedio.toFixed(3)} €/kWh` : "n/d"}</p></Card>
        <Card>
          <p className="mb-1 text-xs font-semibold text-muted">Ultima bolletta</p>
          <p className="font-display text-lg font-extrabold">{ultimaLuce ? fmtEur(Number(ultimaLuce.importo)) : "n/d"}</p>
          <p className="text-xs text-muted">{ultimaLuce ? etichettaPeriodo(ultimaLuce.periodo_da, ultimaLuce.periodo_a) : ""}</p>
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-3 font-display text-sm font-bold">Costo per periodo (€)</h4>
          {datiCosto.length > 0 ? <BarChart dati={datiCosto} formatValue={(v) => fmtEur(v)} /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
        <Card>
          <h4 className="mb-3 font-display text-sm font-bold">Consumo per periodo (kWh)</h4>
          {datiConsumo.length > 0 ? <LineChart dati={datiConsumo} formatValue={(v) => `${v} kWh`} /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
      </div>

      <Card className="mb-6">
        <h4 className="mb-1 font-display text-sm font-bold">Costo unitario nel tempo (€/kWh)</h4>
        <p className="mb-3 text-xs text-muted">Isola se la spesa sale per più consumo o per tariffa più cara.</p>
        {datiCostoUnitario.length > 0 ? <LineChart dati={datiCostoUnitario} formatValue={(v) => `${v.toFixed(3)} €/kWh`} strokeInk /> : <p className="text-sm text-muted">Nessun dato.</p>}
      </Card>

      <h3 className="mb-3 font-display text-base font-bold">Altre bollette</h3>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {[...perCategoria.entries()].map(([categoria, righe]) => (
          <Card key={categoria}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-display text-sm font-bold">{CATEGORIA_LABEL[categoria] ?? categoria}</h4>
              <span className="text-xs text-muted">{righe.length} bollette</span>
            </div>
            <ul className="space-y-2">
              {righe.slice(0, 5).map((b, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {b.fornitore ?? "—"} · {b.domicilio_id ? domicili.get(b.domicilio_id) : ""} · {b.data_emissione}
                  </span>
                  <span className="font-semibold">{fmtEur(Number(b.importo))}</span>
                </li>
              ))}
            </ul>
            {righe.length > 5 && <p className="mt-2 text-xs text-muted">+ altre {righe.length - 5}</p>}
          </Card>
        ))}
      </div>

      <h3 className="mb-3 font-display text-base font-bold">Subscription e spese fisse manuali</h3>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-semibold">Nome</th>
              <th className="px-5 py-3 font-semibold">Categoria</th>
              <th className="px-5 py-3 font-semibold">Importo</th>
              <th className="px-5 py-3 font-semibold">Frequenza</th>
              <th className="px-5 py-3 font-semibold">Stato</th>
            </tr>
          </thead>
          <tbody>
            {speseFisse.map((s, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5 font-bold">{s.nome}</td>
                <td className="px-5 py-2.5 text-muted">{CATEGORIA_LABEL[s.categoria] ?? s.categoria}</td>
                <td className="px-5 py-2.5">{fmtEur(Number(s.importo))}</td>
                <td className="px-5 py-2.5 text-muted">{s.frequenza}</td>
                <td className="px-5 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.attivo ? "bg-pos-bg text-pos" : "bg-line text-muted"}`}>
                    {s.attivo ? "Attiva" : "Disattiva"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

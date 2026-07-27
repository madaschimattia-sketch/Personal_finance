import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import SpeseFisseTable from "../../components/SpeseFisseTable.jsx";
import DateRangeSlider from "../../components/DateRangeSlider.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";
import { CATEGORIA_LABEL } from "../../lib/categorie.js";
import { caricaQuoteDomicili, QUOTA_DOMICILIO_DEFAULT } from "../../lib/domicilio.js";
import { caricaSpeseFisseConQuota } from "../../lib/spesaFissa.js";

// Ambito Casa: bollette utenze_bollette (luce/gas/acqua/internet/condominio/
// affitto/mutuo/tari/imu, a livello di domicilio) + assicurazione_casa da
// spese_fisse_manuali (personale, per intestatario). Non e' la vista di
// sostenibilita' (quella e' "Budget", volutamente secondaria): qui si guarda
// cosa e' stato pagato/e' attivo, non una proiezione.
//
// Sezione "Energia": unica categoria con vera variabilita' mese su mese (importo E
// consumo kWh su ogni bolletta A2A). Grafici separati per costo/consumo invece di un
// combo a doppio asse — un dual-axis mischia due scale diverse ed e' l'errore #1 da
// evitare in un grafico. Periodi bimestrali REALI (mai split mensile finto).
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Descrizione estesa del periodo (es. "nov-dic '24") per caption testuali —
// distinta dall'etichetta sull'asse dei grafici, che deve essere una data
// precisa e non un'abbreviazione di mese (vedi etichettaAsseData sotto).
function descrizionePeriodo(periodoDa, periodoA) {
  const da = new Date(periodoDa);
  const a = periodoA ? new Date(periodoA) : null;
  const daTxt = `${MESI[da.getMonth()]}`;
  if (a && a.getMonth() !== da.getMonth()) {
    return `${daTxt}-${MESI[a.getMonth()]} '${String(da.getFullYear()).slice(2)}`;
  }
  return `${daTxt} '${String(da.getFullYear()).slice(2)}`;
}

// Etichetta sull'asse X dei grafici: data di inizio periodo in formato gg/mm/aa,
// non un'abbreviazione di mese — cosi' si legge la data esatta, non solo il mese.
function etichettaAsseData(periodoDa) {
  return new Date(periodoDa).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Con molti periodi in serie le etichette sull'asse si accavallano: ne mostra
// solo una ogni "step" (sempre l'ultima), senza nascondere le barre/punti.
function passoEtichette(n) {
  return Math.max(1, Math.ceil(n / 7));
}

// Le bollette luce sono nominalmente bimestrali, ma alcuni periodi sono più corti
// (es. dic '24: ~21 giorni per un readjust del contatore) — sommare/confrontare i
// kWh grezzi tra periodi di durata diversa è fuorviante. Si normalizza a kWh/giorno,
// mostrando comunque il dato grezzo (totale + giorni) nel tooltip per trasparenza.
function giorniPeriodo(periodoDa, periodoA) {
  if (!periodoA) return null;
  const ms = new Date(periodoA) - new Date(periodoDa);
  return Math.round(ms / 86400000) + 1;
}

function BarChart({ dati, formatValue, color = "#0B0C10" }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 200, padY = 10;
  const max = Math.max(...dati.map((d) => d.value), 1);
  const slot = w / dati.length;
  const barW = Math.max(6, slot - 10);
  const step = passoEtichette(dati.length);
  return (
    <div className="relative">
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1 text-xs font-bold text-white"
          style={{ left: `${((hover + 0.5) / dati.length) * 100}%`, top: `${((h - (dati[hover].value / max) * (h - padY)) / (h + 24)) * 100}%` }}
        >
          <div>{dati[hover].label}: {formatValue(dati[hover].value)}</div>
          {dati[hover].sub && <div className="font-normal text-hero-muted">{dati[hover].sub}</div>}
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" className="h-52 w-full">
        {dati.map((d, i) => {
          const barH = (d.value / max) * (h - padY);
          const x = i * slot + (slot - barW) / 2;
          const y = h - barH;
          const mostraEtichetta = i % step === 0 || i === dati.length - 1;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={barH} rx={4} fill={color}
                opacity={hover === null || hover === i ? 1 : 0.35}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              />
              {mostraEtichetta && (
                <text x={x + barW / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Un grafico a linee mostra una variazione, non una magnitudine da zero: forzare
// il minimo dell'asse a 0 (come per le barre) su un costo unitario che oscilla
// sempre tra ~0,3 e ~0,8 €/kWh schiaccia la linea in una fascia piatta in alto e
// nasconde le variazioni reali. Il dominio qui usa il min/max effettivo dei dati
// (con un margine), non uno zero forzato.
function LineChart({ dati, formatValue, color = "#B4FF39", strokeInk = false }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 200, padY = 20;
  const values = dati.map((d) => d.value);
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const margine = (maxRaw - minRaw) * 0.15 || Math.abs(maxRaw) * 0.1 || 1;
  const max = maxRaw + margine;
  const min = Math.max(0, minRaw - margine);
  const range = max - min || 1;
  const slot = w / (dati.length - 1 || 1);
  const step = passoEtichette(dati.length);
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
          (i % step === 0 || i === dati.length - 1) && (
            <text key={i} x={pts[i].x} y={h + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{d.label}</text>
          )
        ))}
      </svg>
    </div>
  );
}

// Costo energia vs canone RAI, barre raggruppate (clustered) per periodo — non
// stacked, cosi' si confrontano le due grandezze direttamente. La barra RAI e'
// omessa (non a zero) per i periodi dove canone_rai_eur non e' noto: il
// tooltip lo segnala esplicitamente invece di far sembrare un valore reale.
function ChartCostoEnergiaRai({ dati }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 200, padY = 10;
  const max = Math.max(...dati.map((d) => d.energia + (d.rai ?? 0)), 1);
  const slot = w / dati.length;
  const groupW = Math.max(10, slot - 8);
  const barW = Math.max(4, (groupW - 4) / 2);
  const step = passoEtichette(dati.length);
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs font-semibold text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-hero" />Energia</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />Canone RAI</span>
      </div>
      <div className="relative">
        {hover !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1 text-xs font-bold text-white"
            style={{ left: `${((hover + 0.5) / dati.length) * 100}%`, top: `${((h - (Math.max(dati[hover].energia, dati[hover].rai ?? 0) / max) * (h - padY)) / (h + 24)) * 100}%` }}
          >
            <div>{dati[hover].label}</div>
            <div>Energia: {fmtEur(dati[hover].energia)}</div>
            <div>{dati[hover].raiNoto ? `Canone RAI: ${fmtEur(dati[hover].rai)}` : "Canone RAI non itemizzato in questo periodo"}</div>
          </div>
        )}
        <svg viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" className="h-52 w-full">
          {dati.map((d, i) => {
            const xGroup = i * slot + (slot - groupW) / 2;
            const hEnergia = (d.energia / max) * (h - padY);
            const hRai = d.raiNoto ? (d.rai / max) * (h - padY) : 0;
            const mostraEtichetta = i % step === 0 || i === dati.length - 1;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={xGroup} y={h - hEnergia} width={barW} height={hEnergia} rx={3} fill="#0B0C10" opacity={hover === null || hover === i ? 1 : 0.35} />
                {d.raiNoto && (
                  <rect x={xGroup + barW + 4} y={h - hRai} width={barW} height={hRai} rx={3} fill="#B4FF39" opacity={hover === null || hover === i ? 1 : 0.35} />
                )}
                {mostraEtichetta && (
                  <text x={xGroup + groupW / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{d.label}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function Casa() {
  const { intestatari, intestatarioId } = useFilters();
  const [stato, setStato] = useState("loading");
  const [bolletteGrezze, setBolletteGrezze] = useState([]);
  const [luceGrezza, setLuceGrezza] = useState([]);
  const [assicurazioniCasa, setAssicurazioniCasa] = useState([]);
  const [domicili, setDomicili] = useState(new Map());
  const [quoteDomicili, setQuoteDomicili] = useState(new Map());
  const [range, setRange] = useState(null);

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        // Niente più cutoff periodoGiorni qui: le bollette luce sono mensili/
        // bimestrali e un taglio fisso a giorni-da-oggi mostra spesso mezzo
        // periodo di fatturazione. Si carica tutto lo storico disponibile e si
        // filtra client-side con lo slider "between" (vedi DateRangeSlider).
        const bolletteQuery = supabase.from("utenze_bollette")
          .select("categoria, fornitore, importo, data_emissione, frequenza, domicilio_id")
          .neq("categoria", "luce")
          .order("data_emissione", { ascending: false });

        const luceQuery = supabase.from("utenze_bollette")
          .select("periodo_da, periodo_a, importo, consumo, unita_misura, canone_rai_eur, domicilio_id")
          .eq("categoria", "luce")
          .order("periodo_da", { ascending: true });

        // Assicurazione casa e' l'unica categoria "Casa" che vive in
        // spese_fisse_manuali (cointestabile per riga) invece che in
        // utenze_bollette (cointestabile per domicilio).
        const [bolletteQ, luceQ, assicurazioneCasaData, domiciliQ, quote] = await Promise.all([
          bolletteQuery,
          luceQuery,
          caricaSpeseFisseConQuota(["assicurazione_casa"], intestatarioId, intestatari),
          supabase.from("domicili").select("id, nome"),
          caricaQuoteDomicili(intestatarioId),
        ]);
        if (bolletteQ.error) throw bolletteQ.error;
        if (luceQ.error) throw luceQ.error;

        if (!annullato) {
          const luceData = luceQ.data ?? [];
          const bolletteData = bolletteQ.data ?? [];
          setBolletteGrezze(bolletteData);
          setLuceGrezza(luceData);
          setAssicurazioniCasa(assicurazioneCasaData);
          setDomicili(new Map((domiciliQ.data ?? []).map((d) => [d.id, d.nome])));
          setQuoteDomicili(quote);

          // Default slider: ultimi 12 mesi di dati disponibili (o l'intero
          // range se più corto) — calcolato una sola volta al primo fetch.
          const tutteLeDate = [...luceData.map((b) => b.periodo_da), ...bolletteData.map((b) => b.data_emissione)].sort();
          if (tutteLeDate.length > 0) {
            const minData = tutteLeDate[0];
            const maxData = tutteLeDate[tutteLeDate.length - 1];
            const dodiciMesiFa = new Date(maxData);
            dodiciMesiFa.setFullYear(dodiciMesiFa.getFullYear() - 1);
            const inizioDefault = dodiciMesiFa.toISOString().slice(0, 10);
            setRange([inizioDefault > minData ? inizioDefault : minData, maxData]);
          }
          setStato("ready");
        }
      } catch (e) {
        console.error(e);
        if (!annullato) setStato("error");
      }
    })();
    return () => { annullato = true; };
  }, [intestatarioId, intestatari]);

  if (stato === "loading" || !intestatarioId) return <p className="text-sm text-muted">Caricamento...</p>;
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento di Casa.</p>;

  // Quota del domicilio applicata solo ai campi monetari — non a "consumo"
  // (kWh, dato fisico dell'intera casa: non ha senso "la mia quota di kWh").
  // Quota 0 esclude interamente le righe di quel domicilio (non le azzera).
  const conQuota = (righe) => righe
    .map((r) => ({ ...r, _quota: (quoteDomicili.get(r.domicilio_id) ?? QUOTA_DOMICILIO_DEFAULT).quota }))
    .filter((r) => r._quota > 0);
  const bollette = conQuota(bolletteGrezze);
  const luce = conQuota(luceGrezza);

  const noteCointestazione = [...quoteDomicili.entries()]
    .filter(([, q]) => q.quota < 1 && q.altri.length > 0)
    .map(([domicilioId, q]) => {
      const nomiAltri = q.altri.map((a) => {
        const i = intestatari.find((x) => x.id === a.intestatario_id);
        return `${i?.nome ?? "?"} (${Number(a.quota_percentuale)}%)`;
      }).join(", ");
      return `Domicilio «${domicili.get(domicilioId) ?? "?"}» cointestato con ${nomiAltri}: gli importi mostrati sono la tua quota.`;
    });

  const tutteLeDate = [...luce.map((b) => b.periodo_da), ...bollette.map((b) => b.data_emissione)].sort();
  const minData = tutteLeDate[0] ?? new Date().toISOString().slice(0, 10);
  const maxData = tutteLeDate[tutteLeDate.length - 1] ?? new Date().toISOString().slice(0, 10);
  const [dataDa, dataA] = range ?? [minData, maxData];

  const luceInRange = luce.filter((b) => b.periodo_da >= dataDa && b.periodo_da <= dataA);
  const bolletteInRange = bollette.filter((b) => b.data_emissione >= dataDa && b.data_emissione <= dataA);

  const perCategoria = new Map();
  for (const b of bolletteInRange) {
    const arr = perCategoria.get(b.categoria) ?? [];
    arr.push(b);
    perCategoria.set(b.categoria, arr);
  }

  // Spesa totale/card monetarie: scalate per quota. Consumo/costo unitario
  // (tariffa reale del contratto, non quota personale): sui valori grezzi.
  const speseTotaliLuce = luceInRange.reduce((s, b) => s + Number(b.importo) * b._quota, 0);
  const speseTotaliLuceGrezze = luceInRange.reduce((s, b) => s + Number(b.importo), 0);
  const consumoTotaleLuce = luceInRange.reduce((s, b) => s + Number(b.consumo ?? 0), 0);
  const costoUnitarioMedio = consumoTotaleLuce > 0 ? speseTotaliLuceGrezze / consumoTotaleLuce : null;
  const ultimaLuce = luceInRange[luceInRange.length - 1];

  const datiCosto = luceInRange.map((b) => ({ label: etichettaAsseData(b.periodo_da), value: Number(b.importo) * b._quota }));
  const datiCostoGiornaliero = luceInRange.map((b) => {
    const giorni = giorniPeriodo(b.periodo_da, b.periodo_a);
    const importo = Number(b.importo) * b._quota;
    return {
      label: etichettaAsseData(b.periodo_da),
      value: giorni ? importo / giorni : importo,
      sub: giorni ? `${fmtEur(importo)} su ${giorni} giorni` : `${fmtEur(importo)} (periodo non determinato)`,
    };
  });
  const datiConsumo = luceInRange.map((b) => {
    const giorni = giorniPeriodo(b.periodo_da, b.periodo_a);
    const consumo = Number(b.consumo ?? 0);
    return {
      label: etichettaAsseData(b.periodo_da),
      value: giorni ? consumo / giorni : consumo,
      sub: giorni ? `${consumo} kWh su ${giorni} giorni` : `${consumo} kWh (periodo non determinato)`,
    };
  });
  const datiCostoUnitario = luceInRange
    .filter((b) => Number(b.consumo) > 0)
    .map((b) => ({ label: etichettaAsseData(b.periodo_da), value: Number(b.importo) / Number(b.consumo) }));
  const datiEnergiaRai = luceInRange.map((b) => {
    const importo = Number(b.importo) * b._quota;
    const raiNoto = b.canone_rai_eur != null;
    const rai = raiNoto ? Number(b.canone_rai_eur) * b._quota : null;
    return {
      label: etichettaAsseData(b.periodo_da),
      energia: raiNoto ? importo - rai : importo,
      rai,
      raiNoto,
    };
  });

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Casa</h2>
      <p className="mb-6 text-sm text-muted">
        Bollette e costi fissi già in essere — l'analisi guarda a ciò che è stato pagato o è attivo oggi, non a una proiezione.
        Per il giudizio di sostenibilità rispetto al reddito vedi <span className="font-semibold">Budget</span>.
      </p>

      {noteCointestazione.map((nota, i) => (
        <p key={i} className="mb-4 text-sm text-muted">{nota}</p>
      ))}

      {range && (
        <Card className="mb-6">
          <h4 className="mb-3 font-display text-sm font-bold">Periodo</h4>
          <DateRangeSlider minData={minData} maxData={maxData} value={range} onChange={setRange} />
        </Card>
      )}

      <h3 className="mb-3 font-display text-base font-bold">Energia — luce</h3>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><p className="mb-1 text-xs font-semibold text-muted">Spesa totale</p><p className="font-display text-lg font-extrabold">{fmtEur(speseTotaliLuce)}</p></Card>
        <Card><p className="mb-1 text-xs font-semibold text-muted">Consumo totale</p><p className="font-display text-lg font-extrabold">{consumoTotaleLuce.toLocaleString("en-US")} kWh</p></Card>
        <Card><p className="mb-1 text-xs font-semibold text-muted">Costo unitario medio</p><p className="font-display text-lg font-extrabold">{costoUnitarioMedio !== null ? `${costoUnitarioMedio.toFixed(3)} €/kWh` : "n/d"}</p></Card>
        <Card>
          <p className="mb-1 text-xs font-semibold text-muted">Ultima bolletta</p>
          <p className="font-display text-lg font-extrabold">{ultimaLuce ? fmtEur(Number(ultimaLuce.importo) * ultimaLuce._quota) : "n/d"}</p>
          <p className="text-xs text-muted">{ultimaLuce ? descrizionePeriodo(ultimaLuce.periodo_da, ultimaLuce.periodo_a) : ""}</p>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-3 font-display text-sm font-bold">Costo per periodo (€)</h4>
          {datiCosto.length > 0 ? <BarChart dati={datiCosto} formatValue={(v) => fmtEur(v)} /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
        <Card>
          <h4 className="mb-1 font-display text-sm font-bold">Energia vs canone RAI</h4>
          <p className="mb-3 text-xs text-muted">Quota di canone RAI/TV inclusa nella bolletta, dove nota.</p>
          {datiEnergiaRai.length > 0 ? <ChartCostoEnergiaRai dati={datiEnergiaRai} /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
        <Card>
          <h4 className="mb-1 font-display text-sm font-bold">Costo medio giornaliero (€/giorno)</h4>
          <p className="mb-3 text-xs text-muted">Normalizzato per durata del periodo — comparabile anche tra bollette di lunghezza diversa.</p>
          {datiCostoGiornaliero.length > 0 ? <BarChart dati={datiCostoGiornaliero} formatValue={(v) => `${fmtEur(v)}/giorno`} /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
        <Card>
          <h4 className="mb-1 font-display text-sm font-bold">Consumo medio giornaliero (kWh/giorno)</h4>
          <p className="mb-3 text-xs text-muted">Normalizzato per durata del periodo — i periodi non sono tutti bimestrali esatti.</p>
          {datiConsumo.length > 0 ? <BarChart dati={datiConsumo} formatValue={(v) => `${v.toFixed(1)} kWh/giorno`} color="#B4FF39" /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
        <Card>
          <h4 className="mb-1 font-display text-sm font-bold">Costo unitario nel tempo (€/kWh)</h4>
          <p className="mb-3 text-xs text-muted">Isola se la spesa sale per più consumo o per tariffa più cara.</p>
          {datiCostoUnitario.length > 0 ? <LineChart dati={datiCostoUnitario} formatValue={(v) => `${v.toFixed(3)} €/kWh`} strokeInk /> : <p className="text-sm text-muted">Nessun dato.</p>}
        </Card>
      </div>

      <h3 className="mb-3 font-display text-base font-bold">Altre bollette casa</h3>
      {perCategoria.size > 0 ? (
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
                    <span className="font-semibold">{fmtEur(Number(b.importo) * b._quota)}</span>
                  </li>
                ))}
              </ul>
              {righe.length > 5 && <p className="mt-2 text-xs text-muted">+ altre {righe.length - 5}</p>}
            </Card>
          ))}
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted">Nessuna bolletta in questo periodo.</p>
      )}

      <h3 className="mb-3 font-display text-base font-bold">Assicurazione casa</h3>
      <SpeseFisseTable righe={assicurazioniCasa} />
    </div>
  );
}

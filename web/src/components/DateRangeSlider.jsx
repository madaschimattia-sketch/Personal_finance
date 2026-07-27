const GIORNO_MS = 86400000;

function fmtDataBreve(iso) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function giorniTraDate(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / GIORNO_MS);
}

function giorniAData(base, giorni) {
  return new Date(new Date(base).getTime() + giorni * GIORNO_MS).toISOString().slice(0, 10);
}

// Slider "between" a due maniglie su una scala continua in giorni, usato dalle
// pagine con bollette mensili/bimestrali dove il preset globale periodoGiorni
// (30/90/365 giorni da oggi) taglia male i periodi di fatturazione. Tecnica
// dual-thumb: due <input type="range"> sovrapposti, stile in index.css
// (.range-thumb) rende cliccabile solo il pallino, non l'intero binario.
export default function DateRangeSlider({ minData, maxData, value, onChange }) {
  const totaleGiorni = Math.max(1, giorniTraDate(minData, maxData));
  const daGiorni = Math.min(Math.max(0, giorniTraDate(minData, value[0])), totaleGiorni);
  const aGiorni = Math.min(Math.max(0, giorniTraDate(minData, value[1])), totaleGiorni);

  function handleDa(g) {
    onChange([giorniAData(minData, Math.min(g, aGiorni)), value[1]]);
  }
  function handleA(g) {
    onChange([value[0], giorniAData(minData, Math.max(g, daGiorni))]);
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
        <span>{fmtDataBreve(value[0])}</span>
        <span>{fmtDataBreve(value[1])}</span>
      </div>
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-hero"
          style={{ left: `${(daGiorni / totaleGiorni) * 100}%`, right: `${100 - (aGiorni / totaleGiorni) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={totaleGiorni}
          value={daGiorni}
          onChange={(e) => handleDa(Number(e.target.value))}
          className="range-thumb absolute inset-x-0 top-1/2 w-full -translate-y-1/2 appearance-none bg-transparent"
        />
        <input
          type="range"
          min={0}
          max={totaleGiorni}
          value={aGiorni}
          onChange={(e) => handleA(Number(e.target.value))}
          className="range-thumb absolute inset-x-0 top-1/2 w-full -translate-y-1/2 appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}

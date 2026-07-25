import { useFilters, PERIODO_PRESET } from "../context/FiltersContext.jsx";

export default function FilterBar() {
  const { intestatari, intestatarioId, setIntestatarioId, periodoGiorni, setPeriodoGiorni } = useFilters();

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-chip border border-line bg-surface px-4 py-2.5">
      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
        Intestatario
        <select
          value={intestatarioId ?? ""}
          onChange={(e) => setIntestatarioId(e.target.value)}
          className="rounded-chip border border-line px-2 py-1 text-sm font-semibold text-ink"
        >
          {intestatari.map((i) => (
            <option key={i.id} value={i.id}>{i.nome} {i.cognome}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        Periodo
        <div className="flex overflow-hidden rounded-chip border border-line">
          {PERIODO_PRESET.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriodoGiorni(p.giorni)}
              className={`px-3 py-1 text-xs font-bold transition-colors ${
                periodoGiorni === p.giorni ? "bg-hero text-white" : "text-ink hover:bg-bg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

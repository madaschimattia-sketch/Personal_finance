import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";

const QUADRI_LABEL = {
  RT: "RT — Redditi diversi (plus/minusvalenze)", RM: "RM — Redditi di capitale",
  RW: "RW — IVAFE", RP: "RP — Fondo pensione",
};
// 2022 incluso per il monitoraggio RW del fondo pensione AXA (adesione
// dicembre 2022) — 2023/2024 restano "presentata" (bloccate in scrittura,
// consultabili in sola lettura); 2022 non ha ancora una dichiarazione, quindi
// è l'unico anno storico su cui il "Ricalcola" può ancora scrivere.
const ANNI = [2026, 2025, 2024, 2023, 2022];
const FUNZIONI = ["calcola-quadro-rt", "calcola-quadro-rm", "calcola-quadro-rw", "calcola-fondo-pensione"];

export default function Fiscale() {
  const { intestatari, intestatarioId } = useFilters();
  const [anno, setAnno] = useState(2025);
  const [eventi, setEventi] = useState(null);
  const [statoRicalcolo, setStatoRicalcolo] = useState("");
  const [ricalcolando, setRicalcolando] = useState(false);

  // I quadri fiscali (tax_events) sono la dichiarazione di UNA persona (chi ha
  // relazione='io', qui Mattia): non esiste una "fiscalità di Martina" in
  // quest'app — lei non ha alcun conto/reddito soggetto a dichiarazione,
  // quindi la pagina resta vuota quando è lei l'intestatario selezionato,
  // invece di mostrare per errore i quadri di Mattia.
  const relazioneSelezionata = intestatari.find((i) => i.id === intestatarioId)?.relazione;
  const eProprietario = relazioneSelezionata === "io";

  async function carica(a) {
    const { data, error } = await supabase.from("tax_events").select("*").eq("anno", a).order("quadro").order("tipo");
    if (error) { console.error(error); setEventi([]); return; }
    setEventi(data ?? []);
  }

  useEffect(() => {
    if (!eProprietario) { setEventi([]); return; }
    carica(anno);
  }, [anno, eProprietario]);

  async function ricalcola() {
    setRicalcolando(true);
    setStatoRicalcolo("Ricalcolo in corso...");
    const risultati = [];
    for (const nome of FUNZIONI) {
      try {
        const { error } = await supabase.functions.invoke(nome, { body: { anno } });
        if (error) throw error;
        risultati.push(`${nome}: ok`);
      } catch (e) {
        risultati.push(`${nome}: ${e.message}`);
      }
    }
    setStatoRicalcolo(risultati.join(" | "));
    await carica(anno);
    setRicalcolando(false);
  }

  const perQuadro = new Map();
  for (const e of eventi ?? []) {
    const arr = perQuadro.get(e.quadro) ?? [];
    arr.push(e);
    perQuadro.set(e.quadro, arr);
  }

  if (!eProprietario) {
    return (
      <div>
        <h2 className="mb-5 font-display text-xl font-bold tracking-tight">Fiscale</h2>
        <Card>
          <p className="text-sm text-muted">
            Questa persona non ha una propria dichiarazione fiscale in quest'app: nessun conto o reddito a lei intestato è soggetto a dichiarazione. La fiscalità tracciata qui è solo quella di Mattia.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-5 font-display text-xl font-bold tracking-tight">Fiscale</h2>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold">
          Anno{" "}
          <select value={anno} onChange={(e) => setAnno(Number(e.target.value))} className="ml-2 rounded-chip border border-line px-2 py-1.5 text-sm">
            {ANNI.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button onClick={ricalcola} disabled={ricalcolando} className="rounded-chip bg-hero px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {ricalcolando ? "Ricalcolo..." : "Ricalcola"}
        </button>
        {statoRicalcolo && <span className="text-xs text-muted">{statoRicalcolo}</span>}
      </div>

      {eventi === null && <p className="text-sm text-muted">Caricamento...</p>}
      {eventi && eventi.length === 0 && <p className="text-sm text-muted">Nessun evento fiscale per il {anno}. Premi "Ricalcola".</p>}

      {[...perQuadro.entries()].map(([quadro, righe]) => {
        const totale = righe.reduce((s, e) => s + Number(e.imposta_eur), 0);
        return (
          <div key={quadro} className="mb-5">
            <h3 className="mb-2 font-display text-sm font-bold">{QUADRI_LABEL[quadro] ?? quadro}</h3>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-semibold">Tipo</th>
                    <th className="px-5 py-3 font-semibold">Imponibile</th>
                    <th className="px-5 py-3 font-semibold">Aliquota</th>
                    <th className="px-5 py-3 font-semibold">Imposta</th>
                    <th className="px-5 py-3 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">{e.tipo}</td>
                      <td className="px-5 py-2.5">{fmtEur(Number(e.imponibile_eur))}</td>
                      <td className="px-5 py-2.5">{e.aliquota_pct !== null ? `${e.aliquota_pct}%` : "-"}</td>
                      <td className="px-5 py-2.5 font-semibold">{fmtEur(Number(e.imposta_eur))}</td>
                      <td className="px-5 py-2.5 text-xs text-muted">{e.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-bold">
                    <td className="px-5 py-3" colSpan={3}>Totale imposta {quadro}</td>
                    <td className="px-5 py-3" colSpan={2}>{fmtEur(totale)}</td>
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

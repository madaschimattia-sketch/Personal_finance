import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtEur } from "../lib/format.js";
import Card from "../components/Card.jsx";

const INTESTATARIO_ID = "37af7f90-79d8-42e6-b172-367ccbd38846";
const CATEGORIA_LABEL = {
  luce: "Luce", gas: "Gas", acqua: "Acqua", internet_telefono: "Internet/telefono",
  affitto: "Affitto", condominio: "Condominio", streaming: "Streaming", software: "Software",
  fitness: "Fitness", veicolo: "Veicolo", assicurazione: "Assicurazione", bancario: "Bancario", altro: "Altro",
};
const GIUDIZIO_LABEL = { sostenibile: "Sostenibile", attenzione: "Attenzione", rischio: "A rischio" };
const GIUDIZIO_CLASSE = { sostenibile: "bg-pos-bg text-pos", attenzione: "bg-warn-bg text-warn-ink", rischio: "bg-[#FFE1DB] text-neg" };
const DIREZIONE_LABEL = { migliora: "In miglioramento", peggiora: "In peggioramento", stabile: "Stabile", dati_insufficienti: "Dati insufficienti" };

function fmtPct1(v) { return `${v.toFixed(1)}%`; }

export default function Budget() {
  const [stato, setStato] = useState("loading");
  const [risultato, setRisultato] = useState(null);
  const [nota, setNota] = useState(null);

  async function carica() {
    setStato("loading");
    try {
      const { data, error } = await supabase.functions.invoke("calcola-budget-sostenibilita", { body: { intestatario_id: INTESTATARIO_ID } });
      if (error) throw error;
      if (!data.risultato) {
        setNota(data.nota ?? "Nessun dato disponibile.");
        setRisultato(null);
      } else {
        setNota(null);
        setRisultato(data.risultato);
      }
      setStato("ready");
    } catch (e) {
      console.error(e);
      setStato("error");
    }
  }

  useEffect(() => { carica(); }, []);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Budget <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 align-middle text-xs font-bold uppercase tracking-wide text-warn-ink">Extra</span></h2>
          <p className="mt-1 text-sm text-muted">Confronto costi fissi vs reddito ricorrente — nessuna raccomandazione di prodotto specifico.</p>
        </div>
        <button onClick={carica} className="rounded-chip bg-hero px-4 py-2 text-sm font-bold text-white">Ricalcola</button>
      </div>

      {stato === "loading" && <p className="text-sm text-muted">Caricamento...</p>}
      {stato === "error" && <p className="text-sm text-neg">Errore nel calcolo.</p>}
      {nota && <p className="text-sm text-muted">{nota}</p>}

      {risultato && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card><p className="mb-1 text-xs font-semibold text-muted">Costi fissi mensili</p><p className="font-display text-lg font-extrabold">{fmtEur(risultato.costiFissiMensiliTotali)}</p></Card>
            <Card><p className="mb-1 text-xs font-semibold text-muted">Reddito ricorrente</p><p className="font-display text-lg font-extrabold">{fmtEur(risultato.redditoRicorrenteMensile)}</p></Card>
            <Card>
              <p className="mb-1 text-xs font-semibold text-muted">Rapporto</p>
              <p className="font-display text-lg font-extrabold">{fmtPct1(risultato.rapportoPct)}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${GIUDIZIO_CLASSE[risultato.giudizio]}`}>{GIUDIZIO_LABEL[risultato.giudizio]}</span>
            </Card>
            <Card><p className="mb-1 text-xs font-semibold text-muted">Margine mensile</p><p className="font-display text-lg font-extrabold">{fmtEur(risultato.margineMensile)}</p></Card>
          </div>

          <p className="mb-5 text-sm text-muted">
            Reddito medio annualizzato (include tredicesima/bonus): {fmtEur(risultato.redditoMedioAnnualizzato)}/mese. Fondo emergenza target: {fmtEur(risultato.fondoEmergenzaTargetMinEur)} – {fmtEur(risultato.fondoEmergenzaTargetMaxEur)} (3-6 mesi di costi fissi).
            {risultato.righeBolletteEscluse > 0 && ` ${risultato.righeBolletteEscluse} riga/e esclusa/e dal calcolo (frequenza non ricorrente).`}
          </p>

          <h3 className="mb-3 font-display text-base font-bold">Costi fissi per categoria</h3>
          <Card className="mb-5 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Categoria</th>
                  <th className="px-5 py-3 font-semibold">Costo mensile equivalente</th>
                  <th className="px-5 py-3 font-semibold">Righe</th>
                </tr>
              </thead>
              <tbody>
                {[...risultato.costiPerCategoria].sort((a, b) => b.costoMensileEquivalente - a.costoMensileEquivalente).map((c) => (
                  <tr key={c.categoria} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-bold">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</td>
                    <td className="px-5 py-2.5">{fmtEur(c.costoMensileEquivalente)}</td>
                    <td className="px-5 py-2.5 text-muted">{c.numeroRighe}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-bold">
                  <td className="px-5 py-3">Totale</td>
                  <td className="px-5 py-3">{fmtEur(risultato.costiFissiMensiliTotali)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <h3 className="mb-3 font-display text-base font-bold">Trend</h3>
          <Card>
            <p className="text-sm text-muted">
              Rapporto costi/reddito: prima metà del periodo osservato {risultato.trend.rapportoPctPrimaMeta !== null ? fmtPct1(risultato.trend.rapportoPctPrimaMeta) : "-"},
              seconda metà {risultato.trend.rapportoPctSecondaMeta !== null ? fmtPct1(risultato.trend.rapportoPctSecondaMeta) : "-"} → <span className="font-semibold text-ink">{DIREZIONE_LABEL[risultato.trend.direzione]}</span>.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

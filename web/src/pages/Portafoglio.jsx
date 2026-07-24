import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtEur } from "../lib/format.js";
import Card from "../components/Card.jsx";

// Stessa aggregazione client-side del sito vanilla (js/client/portafoglio.js):
// tax_lots aperti + valore attuale dall'ultimo snapshot posizioni_aperte_ibkr.
export default function Portafoglio() {
  const [stato, setStato] = useState("loading");
  const [righe, setRighe] = useState([]);
  const [info, setInfo] = useState("");

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const [{ data: lotti, error: erroreLotti }, { data: strumenti, error: erroreStrumenti }] = await Promise.all([
          supabase.from("tax_lots").select("instrument_id, quantita_residua, costo_unitario_eur").eq("stato", "aperto"),
          supabase.from("tax_instruments").select("id, symbol, descrizione, asset_category, isin, conid"),
        ]);
        if (erroreLotti || erroreStrumenti) throw erroreLotti || erroreStrumenti;

        const { data: dataUltima } = await supabase
          .from("posizioni_aperte_ibkr").select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
        const ultimaData = dataUltima?.report_date ?? null;

        let posizioni = [];
        if (ultimaData) {
          const { data } = await supabase.from("posizioni_aperte_ibkr")
            .select("isin, conid, mark_price, position_value_eur").eq("report_date", ultimaData);
          posizioni = data ?? [];
        }
        const posPerIsin = new Map(posizioni.filter((p) => p.isin).map((p) => [p.isin, p]));
        const posPerConid = new Map(posizioni.map((p) => [p.conid, p]));
        const strumentoPerId = new Map((strumenti ?? []).map((s) => [s.id, s]));

        const aggregati = new Map();
        for (const lotto of lotti ?? []) {
          const esistente = aggregati.get(lotto.instrument_id) ?? { quantita: 0, costo: 0 };
          esistente.quantita += Number(lotto.quantita_residua);
          esistente.costo += Number(lotto.quantita_residua) * Number(lotto.costo_unitario_eur);
          aggregati.set(lotto.instrument_id, esistente);
        }

        const risultato = [...aggregati.entries()].map(([instrumentId, agg]) => {
          const strumento = strumentoPerId.get(instrumentId);
          const posizione = strumento?.isin ? posPerIsin.get(strumento.isin) : posPerConid.get(strumento?.conid);
          const valoreAttuale = posizione ? Number(posizione.position_value_eur) : null;
          return {
            symbol: strumento?.symbol ?? "?",
            assetClass: strumento?.asset_category ?? "-",
            quantita: agg.quantita,
            costo: agg.costo,
            valoreAttuale,
            plNonRealizzato: valoreAttuale !== null ? valoreAttuale - agg.costo : null,
          };
        }).sort((a, b) => a.symbol.localeCompare(b.symbol));

        if (!annullato) {
          setRighe(risultato);
          setInfo(ultimaData ? `Valori attuali dall'ultimo snapshot disponibile (${ultimaData}) — non prezzi live.` : "Nessuno snapshot posizioni disponibile: solo quantità/costo.");
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
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento del portafoglio.</p>;

  const totaleCosto = righe.reduce((s, r) => s + r.costo, 0);
  const totaleValore = righe.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Portafoglio</h2>
      <p className="mb-5 text-sm text-muted">{info}</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-semibold">Strumento</th>
              <th className="px-5 py-3 font-semibold">Asset class</th>
              <th className="px-5 py-3 font-semibold">Quantità</th>
              <th className="px-5 py-3 font-semibold">Costo</th>
              <th className="px-5 py-3 font-semibold">Valore attuale</th>
              <th className="px-5 py-3 font-semibold">P&amp;L non realizzato</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.symbol} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5 font-bold">{r.symbol}</td>
                <td className="px-5 py-2.5 text-muted">{r.assetClass}</td>
                <td className="px-5 py-2.5">{r.quantita}</td>
                <td className="px-5 py-2.5">{fmtEur(r.costo)}</td>
                <td className="px-5 py-2.5">{r.valoreAttuale !== null ? fmtEur(r.valoreAttuale) : "-"}</td>
                <td className={`px-5 py-2.5 font-semibold ${r.plNonRealizzato > 0 ? "text-pos" : r.plNonRealizzato < 0 ? "text-neg" : ""}`}>
                  {r.plNonRealizzato !== null ? fmtEur(r.plNonRealizzato) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-bold">
              <td className="px-5 py-3" colSpan={3}>Totale</td>
              <td className="px-5 py-3">{fmtEur(totaleCosto)}</td>
              <td className="px-5 py-3">{fmtEur(totaleValore)}</td>
              <td className={`px-5 py-3 ${totaleValore - totaleCosto >= 0 ? "text-pos" : "text-neg"}`}>{fmtEur(totaleValore - totaleCosto)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}

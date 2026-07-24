import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fmtEur } from "../lib/format.js";
import Card from "../components/Card.jsx";

// Vista sulle utenze GIA' IN ESSERE (bollette reali + spese fisse manuali) — non e'
// la vista di sostenibilita' (quella e' "Budget", volutamente secondaria). Qui si
// guarda cosa e' stato pagato/e' attivo, non una proiezione.
const CATEGORIA_LABEL = {
  luce: "Luce", gas: "Gas", acqua: "Acqua", internet_telefono: "Internet/telefono",
  affitto: "Affitto", condominio: "Condominio", streaming: "Streaming", software: "Software",
  fitness: "Fitness", veicolo: "Veicolo", assicurazione: "Assicurazione", bancario: "Bancario", altro: "Altro",
};

export default function Utenze() {
  const [stato, setStato] = useState("loading");
  const [bollette, setBollette] = useState([]);
  const [speseFisse, setSpeseFisse] = useState([]);
  const [domicili, setDomicili] = useState(new Map());

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const [bolletteQ, speseQ, domiciliQ] = await Promise.all([
          supabase.from("utenze_bollette")
            .select("categoria, fornitore, importo, data_emissione, frequenza, domicilio_id")
            .order("data_emissione", { ascending: false }),
          supabase.from("spese_fisse_manuali")
            .select("nome, categoria, importo, frequenza, attivo, data_inizio")
            .order("categoria"),
          supabase.from("domicili").select("id, nome"),
        ]);
        if (bolletteQ.error) throw bolletteQ.error;
        if (speseQ.error) throw speseQ.error;

        if (!annullato) {
          setBollette(bolletteQ.data ?? []);
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

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Utenze</h2>
      <p className="mb-5 text-sm text-muted">
        Bollette e costi fissi già in essere — l'analisi guarda a ciò che è stato pagato o è attivo oggi, non a una proiezione.
        Per il giudizio di sostenibilità rispetto al reddito vedi <span className="font-semibold">Budget</span>.
      </p>

      <h3 className="mb-3 font-display text-base font-bold">Bollette per categoria</h3>
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

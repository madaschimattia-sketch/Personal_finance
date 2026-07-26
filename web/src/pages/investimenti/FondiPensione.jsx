import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";

const TIPO_LABEL = { fondo_aperto: "Fondo aperto", pip: "PIP", fondo_chiuso_negoziale: "Fondo chiuso/negoziale", estero: "Estero" };

export default function FondiPensione() {
  const { intestatarioId } = useFilters();
  const [stato, setStato] = useState("loading");
  const [fondi, setFondi] = useState([]);
  const [versamentiPerFondo, setVersamentiPerFondo] = useState(new Map());
  const [posizionePerFondo, setPosizionePerFondo] = useState(new Map());

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        const { data: fondiData, error } = await supabase.from("fondi_pensione")
          .select("id, nome, tipo, is_estero, provider, note")
          .eq("intestatario_id", intestatarioId)
          .order("nome");
        if (error) throw error;
        const idFondi = (fondiData ?? []).map((f) => f.id);

        let versamenti = [];
        let posizioni = [];
        if (idFondi.length > 0) {
          const [{ data: v }, { data: p }] = await Promise.all([
            supabase.from("fondo_pensione_versamenti").select("fondo_id, anno_competenza, importo_eur, deducibile").in("fondo_id", idFondi),
            supabase.from("fondo_pensione_posizione").select("fondo_id, data_valorizzazione, controvalore_eur, rendimento_periodo_pct").in("fondo_id", idFondi).order("data_valorizzazione", { ascending: false }),
          ]);
          versamenti = v ?? [];
          posizioni = p ?? [];
        }

        const versPerFondo = new Map();
        for (const v of versamenti) {
          const arr = versPerFondo.get(v.fondo_id) ?? [];
          arr.push(v);
          versPerFondo.set(v.fondo_id, arr);
        }
        const posPerFondo = new Map();
        for (const p of posizioni) {
          if (!posPerFondo.has(p.fondo_id)) posPerFondo.set(p.fondo_id, p); // ordinato desc: la prima occorrenza e' la piu' recente
        }

        if (!annullato) {
          setFondi(fondiData ?? []);
          setVersamentiPerFondo(versPerFondo);
          setPosizionePerFondo(posPerFondo);
          setStato("ready");
        }
      } catch (e) {
        console.error(e);
        if (!annullato) setStato("error");
      }
    })();
    return () => { annullato = true; };
  }, [intestatarioId]);

  if (stato === "loading" || !intestatarioId) return <p className="text-sm text-muted">Caricamento...</p>;
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento dei fondi pensione.</p>;

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Fondi Pensione</h2>
      <p className="mb-6 text-sm text-muted">
        Anagrafica, versamenti e ultimo controvalore noto — inserimento manuale (nessuna pipeline automatica, a differenza del portafoglio IBKR). La deduzione fiscale (quadro RP) resta in Fiscalità.
      </p>

      {fondi.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Nessun fondo pensione registrato ancora. Carica i documenti (adesione, versamenti, estratti posizione) nella cartella Drive dedicata e verranno inseriti qui.
          </p>
        </Card>
      ) : (
        fondi.map((f) => {
          const versamenti = versamentiPerFondo.get(f.id) ?? [];
          const perAnno = new Map();
          for (const v of versamenti) {
            const cur = perAnno.get(v.anno_competenza) ?? { deducibile: 0, nonDeducibile: 0 };
            if (v.deducibile) cur.deducibile += Number(v.importo_eur);
            else cur.nonDeducibile += Number(v.importo_eur);
            perAnno.set(v.anno_competenza, cur);
          }
          const posizione = posizionePerFondo.get(f.id);
          return (
            <div key={f.id} className="mb-5">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-display text-sm font-bold">{f.nome}</h3>
                <span className="text-xs text-muted">
                  {TIPO_LABEL[f.tipo] ?? f.tipo}{f.provider ? ` · ${f.provider}` : ""}{f.is_estero ? " · estero (RW)" : ""}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                  <p className="mb-1 text-xs font-semibold text-muted">Ultimo controvalore noto</p>
                  <p className="font-display text-lg font-extrabold">{posizione ? fmtEur(Number(posizione.controvalore_eur)) : "n/d"}</p>
                  <p className="text-xs text-muted">{posizione ? `al ${posizione.data_valorizzazione}` : "nessuno snapshot caricato"}</p>
                </Card>
                <Card>
                  <p className="mb-1 text-xs font-semibold text-muted">Versamenti totali</p>
                  <p className="font-display text-lg font-extrabold">{fmtEur(versamenti.reduce((s, v) => s + Number(v.importo_eur), 0))}</p>
                  <p className="text-xs text-muted">{versamenti.length} versamento/i registrato/i</p>
                </Card>
              </div>
              {perAnno.size > 0 && (
                <Card className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-5 py-3 font-semibold">Anno</th>
                        <th className="px-5 py-3 font-semibold">Deducibile</th>
                        <th className="px-5 py-3 font-semibold">Non deducibile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...perAnno.entries()].sort((a, b) => b[0] - a[0]).map(([anno, importi]) => (
                        <tr key={anno} className="border-b border-line last:border-0">
                          <td className="px-5 py-2.5 font-bold">{anno}</td>
                          <td className="px-5 py-2.5">{fmtEur(importi.deducibile)}</td>
                          <td className="px-5 py-2.5 text-muted">{fmtEur(importi.nonDeducibile)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

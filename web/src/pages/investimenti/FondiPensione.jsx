import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";

const TIPO_LABEL = { fondo_aperto: "Fondo aperto", pip: "PIP", fondo_chiuso_negoziale: "Fondo chiuso/negoziale", estero: "Estero" };

// Palette per fondo nel grafico stacked — stessa famiglia hero/accent/ink già
// usata altrove (Dashboard.jsx ASSET_CLASS_COLOR), estesa a più tonalità perché
// qui il numero di fondi non è un enum fisso come le asset class.
const PALETTE_FONDI = ["#0B0C10", "#B4FF39", "#6B7280", "#0B0C10AA", "#B4FF39AA", "#9CA3AF"];

// Stacked bar chart per anno: ogni barra è un anno, i segmenti sono i singoli
// fondi (ultimo controvalore noto entro quell'anno) — mostra la crescita del
// patrimonio previdenziale complessivo nel tempo, non solo lo snapshot più
// recente. "Cluster" nel senso di un cluster (barra) per anno, stacked al suo
// interno per fondo.
function GraficoFondiTempo({ anni, fondiOrdinati }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 220, padY = 10;
  const totaliPerAnno = anni.map((a) => fondiOrdinati.reduce((s, f) => s + (a.valori.get(f.id) ?? 0), 0));
  const max = Math.max(...totaliPerAnno, 1);
  const slot = w / anni.length;
  const barW = Math.max(16, slot * 0.55);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-muted">
        {fondiOrdinati.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE_FONDI[i % PALETTE_FONDI.length] }} />
            {f.nome}
          </span>
        ))}
      </div>
      <div className="relative">
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1.5 text-xs font-bold text-white"
            style={{ left: `${((hover + 0.5) / anni.length) * 100}%`, top: `${(1 - totaliPerAnno[hover] / max) * 100 * (h / (h + 24)) }%` }}
          >
            <div className="mb-0.5">{anni[hover].anno}</div>
            {fondiOrdinati.map((f) => {
              const v = anni[hover].valori.get(f.id);
              return v ? <div key={f.id}>{f.nome}: {fmtEur(v)}</div> : null;
            })}
            <div className="mt-0.5 border-t border-white/30 pt-0.5">Totale: {fmtEur(totaliPerAnno[hover])}</div>
          </div>
        )}
        <svg viewBox={`0 0 ${w} ${h + 24}`} preserveAspectRatio="none" className="h-56 w-full">
          {anni.map((a, i) => {
            const x = i * slot + (slot - barW) / 2;
            let yCursor = h;
            const segmenti = fondiOrdinati.map((f, fi) => {
              const v = a.valori.get(f.id) ?? 0;
              const altezza = (v / max) * (h - padY);
              const y = yCursor - altezza;
              yCursor = y;
              return { fi, y, altezza, v };
            });
            return (
              <g key={a.anno} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {segmenti.map((s) => s.v > 0 && (
                  <rect key={s.fi} x={x} y={s.y} width={barW} height={s.altezza}
                    fill={PALETTE_FONDI[s.fi % PALETTE_FONDI.length]} opacity={hover === null || hover === i ? 1 : 0.35} />
                ))}
                <text x={x + barW / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="#6B7280">{a.anno}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function FondiPensione() {
  const { intestatarioId } = useFilters();
  const [stato, setStato] = useState("loading");
  const [fondi, setFondi] = useState([]);
  const [versamentiPerFondo, setVersamentiPerFondo] = useState(new Map());
  const [posizionePerFondo, setPosizionePerFondo] = useState(new Map());
  const [posizioniComplete, setPosizioniComplete] = useState([]);

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
          setPosizioniComplete(posizioni);
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

  // View totale: aggrega TUTTI i fondi dell'intestatario selezionato, non un
  // singolo fondo — usa l'ultimo controvalore noto per fondo (stessa logica
  // "prima occorrenza = più recente" di posPerFondo sopra) e la somma di tutti
  // i versamenti registrati.
  const totaleControvalore = [...posizionePerFondo.values()].reduce((s, p) => s + Number(p.controvalore_eur), 0);
  const tuttiVersamenti = [...versamentiPerFondo.values()].flat();
  const totaleVersamenti = tuttiVersamenti.reduce((s, v) => s + Number(v.importo_eur), 0);
  const plusvalenzaStimata = totaleControvalore - totaleVersamenti;

  // Per anno: ultimo controvalore noto entro quell'anno, per fondo (non la
  // somma dei versamenti — il controvalore è già un saldo, sommarlo per anno
  // lo conterebbe più volte).
  const perAnnoFondo = new Map();
  for (const p of posizioniComplete) {
    const anno = Number(p.data_valorizzazione.slice(0, 4));
    const perFondo = perAnnoFondo.get(anno) ?? new Map();
    const esistente = perFondo.get(p.fondo_id);
    if (!esistente || p.data_valorizzazione > esistente.data) {
      perFondo.set(p.fondo_id, { data: p.data_valorizzazione, controvalore: Number(p.controvalore_eur) });
    }
    perAnnoFondo.set(anno, perFondo);
  }
  const anni = [...perAnnoFondo.entries()].sort((a, b) => a[0] - b[0]).map(([anno, perFondo]) => ({
    anno,
    valori: new Map([...perFondo.entries()].map(([fondoId, v]) => [fondoId, v.controvalore])),
  }));

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Fondi Pensione</h2>
      <p className="mb-6 text-sm text-muted">
        Anagrafica, versamenti e ultimo controvalore noto — inserimento manuale (nessuna pipeline automatica, a differenza del portafoglio IBKR). La deduzione fiscale (quadro RP) resta in Fiscalità.
      </p>

      {fondi.length > 0 && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card><p className="mb-1 text-xs font-semibold text-muted">Controvalore totale</p><p className="font-display text-lg font-extrabold">{fmtEur(totaleControvalore)}</p></Card>
            <Card><p className="mb-1 text-xs font-semibold text-muted">Versamenti totali</p><p className="font-display text-lg font-extrabold">{fmtEur(totaleVersamenti)}</p></Card>
            <Card>
              <p className="mb-1 text-xs font-semibold text-muted">Plusvalenza stimata</p>
              <p className={`font-display text-lg font-extrabold ${plusvalenzaStimata >= 0 ? "text-pos" : "text-neg"}`}>{fmtEur(plusvalenzaStimata)}</p>
            </Card>
            <Card><p className="mb-1 text-xs font-semibold text-muted">Fondi registrati</p><p className="font-display text-lg font-extrabold">{fondi.length}</p></Card>
          </div>
          {anni.length > 0 && (
            <Card className="mb-6">
              <h3 className="mb-3 font-display text-sm font-bold">Controvalore per fondo nel tempo</h3>
              <GraficoFondiTempo anni={anni} fondiOrdinati={fondi} />
            </Card>
          )}
        </>
      )}

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

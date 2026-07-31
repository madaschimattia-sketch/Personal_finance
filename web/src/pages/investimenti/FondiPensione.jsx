import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { fmtEur } from "../../lib/format.js";
import Card from "../../components/Card.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";

const TIPO_LABEL = { fondo_aperto: "Fondo aperto", pip: "PIP", fondo_chiuso_negoziale: "Fondo chiuso/negoziale", estero: "Estero" };
const TIPO_VERSAMENTO_LABEL = { volontario: "Personale", contributo_datore_lavoro: "Azienda", tfr: "TFR", trasferimento_da_altro_fondo: "Trasferimento" };
const TIPO_VERSAMENTO_ORDINE = ["volontario", "contributo_datore_lavoro", "tfr", "trasferimento_da_altro_fondo"];
const PALETTE_TIPO_VERSAMENTO = { volontario: "#0B0C10", contributo_datore_lavoro: "#B4FF39", tfr: "#6B7280", trasferimento_da_altro_fondo: "#9CA3AF" };

// Palette per fondo nel grafico stacked — stessa famiglia hero/accent/ink già
// usata altrove (Dashboard.jsx ASSET_CLASS_COLOR), estesa a più tonalità perché
// qui il numero di fondi non è un enum fisso come le asset class.
const PALETTE_FONDI = ["#0B0C10", "#B4FF39", "#6B7280", "#0B0C10AA", "#B4FF39AA", "#9CA3AF"];

// I report di alcuni fondi (AXA — vedi Prospetto/Situation) datano lo snapshot al
// 1° gennaio dell'anno SUCCESSIVO a quello che valorizzano: "01/01/2026" è il
// controvalore di chiusura 2025, non un valore del 2026. Regola generale (non
// specifica ad AXA per nome): uno snapshot datato esattamente 1° gennaio
// rappresenta la chiusura dell'anno precedente — è l'unica lettura sensata di
// una valorizzazione "al 1° gennaio" (nessun fondo valorizza a inizio giornata
// del 1/1). Il fondo Generali usa 31/12, non serve alcuno spostamento.
function annoEffettivo(dataIso) {
  const anno = Number(dataIso.slice(0, 4));
  return dataIso.slice(5, 10) === "01-01" ? anno - 1 : anno;
}

function fmtEurCompatto(v) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k€` : fmtEur(v);
}

// Stacked bar chart per anno: ogni barra è un anno, i segmenti sono i singoli
// fondi (ultimo controvalore noto entro quell'anno, anno_effettivo — vedi sopra)
// — mostra la crescita del patrimonio previdenziale complessivo nel tempo, non
// solo lo snapshot più recente. "Cluster" nel senso di un cluster (barra) per
// anno, stacked al suo interno per fondo. Totale sempre etichettato sopra la
// barra (non solo in tooltip, altrimenti i valori si leggono solo passandoci
// sopra col mouse).
function GraficoFondiTempo({ anni, fondiOrdinati }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 200, padTop = 26, padBottom = 10;
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
            style={{ left: `${((hover + 0.5) / anni.length) * 100}%`, top: `${((padTop + (1 - totaliPerAnno[hover] / max) * (h - padTop - padBottom)) / (h + padBottom)) * 100}%` }}
          >
            <div className="mb-0.5">{anni[hover].anno}</div>
            {fondiOrdinati.map((f) => {
              const v = anni[hover].valori.get(f.id);
              return v ? <div key={f.id}>{f.nome}: {fmtEur(v)}</div> : null;
            })}
            <div className="mt-0.5 border-t border-white/30 pt-0.5">Totale: {fmtEur(totaliPerAnno[hover])}</div>
          </div>
        )}
        <svg viewBox={`0 0 ${w} ${h + padBottom}`} preserveAspectRatio="none" className="h-56 w-full">
          {anni.map((a, i) => {
            const x = i * slot + (slot - barW) / 2;
            let yCursor = h;
            const segmenti = fondiOrdinati.map((f, fi) => {
              const v = a.valori.get(f.id) ?? 0;
              const altezza = (v / max) * (h - padTop - padBottom);
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
                <text x={x + barW / 2} y={yCursor - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0B0C10">
                  {fmtEurCompatto(totaliPerAnno[i])}
                </text>
                <text x={x + barW / 2} y={h + 24} textAnchor="middle" fontSize="10" fill="#6B7280">{a.anno}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Rendimento netto per fondo per anno — SOLO quando la fonte ufficiale (Prospetto
// annuale) riporta il dato in rendimento_periodo_pct: mai ricalcolato da
// variazione-controvalore-meno-versamenti, che darebbe un numero sbagliato
// quando ci sono grossi versamenti infra-annuali (il rendimento reale è sulla
// giacenza media, non sul saldo iniziale — vedi migration 0047). Anni/fondi
// senza dato ufficiale restano assenti dal grafico, non stimati.
function GraficoRendimentoFondi({ anni, fondiOrdinati }) {
  const [hover, setHover] = useState(null);
  const w = 720, h = 160, padTop = 20, padBottom = 10;
  const tutti = anni.flatMap((a) => [...a.rendimenti.values()]);
  const max = Math.max(...tutti, 1);
  const slot = w / anni.length;
  const gruppoW = Math.max(20, slot * 0.7);
  const barW = Math.max(6, (gruppoW - (fondiOrdinati.length - 1) * 3) / fondiOrdinati.length);

  return (
    <div>
      <div className="relative">
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1.5 text-xs font-bold text-white"
            style={{ left: `${hover.leftPct}%`, top: `${hover.topPct}%` }}
          >
            {hover.nome} {hover.anno}: +{hover.pct.toFixed(2)}%
          </div>
        )}
        <svg viewBox={`0 0 ${w} ${h + padBottom}`} preserveAspectRatio="none" className="h-44 w-full">
          {anni.map((a, i) => {
            const xGruppo = i * slot + (slot - gruppoW) / 2;
            return (
              <g key={a.anno}>
                {fondiOrdinati.map((f, fi) => {
                  const pct = a.rendimenti.get(f.id);
                  if (pct == null) return null;
                  const x = xGruppo + fi * (barW + 3);
                  const altezza = (pct / max) * (h - padTop - padBottom);
                  const y = h - altezza;
                  return (
                    <rect
                      key={f.id} x={x} y={y} width={barW} height={altezza} rx={2}
                      fill={PALETTE_FONDI[fi % PALETTE_FONDI.length]}
                      onMouseEnter={() => setHover({ nome: f.nome, anno: a.anno, pct, leftPct: ((x + barW / 2) / w) * 100, topPct: (y / (h + padBottom)) * 100 })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                <text x={xGruppo + gruppoW / 2} y={h + 24} textAnchor="middle" fontSize="10" fill="#6B7280">{a.anno}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Composizione dei versamenti di UN fondo per anno di competenza (personale /
// azienda / TFR / trasferimento) — stacked bar. Non specifico per nome fondo:
// si attiva per qualunque fondo con più di un tipo_versamento distinto (oggi
// solo Generali, che ha tutti e tre; AXA ha solo "volontario" quindi lo stack
// avrebbe un solo segmento — non renderizzato, non aggiunge informazione).
function GraficoContributiFondo({ perAnno, tipiPresenti }) {
  const [hover, setHover] = useState(null);
  const anni = [...perAnno.keys()].sort((a, b) => a - b);
  const w = 640, h = 160, padTop = 22, padBottom = 10;
  const totali = anni.map((a) => tipiPresenti.reduce((s, t) => s + (perAnno.get(a).get(t) ?? 0), 0));
  const max = Math.max(...totali, 1);
  const slot = w / anni.length;
  const barW = Math.max(16, slot * 0.5);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
        {tipiPresenti.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE_TIPO_VERSAMENTO[t] }} />
            {TIPO_VERSAMENTO_LABEL[t] ?? t}
          </span>
        ))}
      </div>
      <div className="relative">
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-chip bg-hero px-2.5 py-1.5 text-xs font-bold text-white"
            style={{ left: `${((hover + 0.5) / anni.length) * 100}%`, top: `${((padTop + (1 - totali[hover] / max) * (h - padTop - padBottom)) / (h + padBottom)) * 100}%` }}
          >
            <div className="mb-0.5">{anni[hover]}</div>
            {tipiPresenti.map((t) => {
              const v = perAnno.get(anni[hover]).get(t);
              return v ? <div key={t}>{TIPO_VERSAMENTO_LABEL[t] ?? t}: {fmtEur(v)}</div> : null;
            })}
          </div>
        )}
        <svg viewBox={`0 0 ${w} ${h + padBottom}`} preserveAspectRatio="none" className="h-44 w-full">
          {anni.map((anno, i) => {
            const x = i * slot + (slot - barW) / 2;
            let yCursor = h;
            const valori = perAnno.get(anno);
            const segmenti = tipiPresenti.map((t) => {
              const v = valori.get(t) ?? 0;
              const altezza = (v / max) * (h - padTop - padBottom);
              const y = yCursor - altezza;
              yCursor = y;
              return { t, y, altezza, v };
            });
            return (
              <g key={anno} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {segmenti.map((s) => s.v > 0 && (
                  <rect key={s.t} x={x} y={s.y} width={barW} height={s.altezza} fill={PALETTE_TIPO_VERSAMENTO[s.t]} opacity={hover === null || hover === i ? 1 : 0.35} />
                ))}
                <text x={x + barW / 2} y={h + 24} textAnchor="middle" fontSize="10" fill="#6B7280">{anno}</text>
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
            supabase.from("fondo_pensione_versamenti").select("fondo_id, anno_competenza, importo_eur, tipo_versamento").in("fondo_id", idFondi),
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

  // Per anno EFFETTIVO (vedi annoEffettivo sopra): ultimo controvalore noto
  // entro quell'anno, per fondo (non la somma dei versamenti — il controvalore
  // è già un saldo, sommarlo per anno lo conterebbe più volte).
  const perAnnoFondo = new Map();
  const perAnnoRendimento = new Map();
  for (const p of posizioniComplete) {
    const anno = annoEffettivo(p.data_valorizzazione);
    const perFondo = perAnnoFondo.get(anno) ?? new Map();
    const esistente = perFondo.get(p.fondo_id);
    if (!esistente || p.data_valorizzazione > esistente.data) {
      perFondo.set(p.fondo_id, { data: p.data_valorizzazione, controvalore: Number(p.controvalore_eur) });
    }
    perAnnoFondo.set(anno, perFondo);
    if (p.rendimento_periodo_pct != null) {
      const perFondoRend = perAnnoRendimento.get(anno) ?? new Map();
      perFondoRend.set(p.fondo_id, Number(p.rendimento_periodo_pct));
      perAnnoRendimento.set(anno, perFondoRend);
    }
  }
  const anni = [...perAnnoFondo.entries()].sort((a, b) => a[0] - b[0]).map(([anno, perFondo]) => ({
    anno,
    valori: new Map([...perFondo.entries()].map(([fondoId, v]) => [fondoId, v.controvalore])),
  }));
  const anniRendimento = [...perAnnoRendimento.entries()].sort((a, b) => a[0] - b[0]).map(([anno, rendimenti]) => ({ anno, rendimenti }));

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
          {anniRendimento.length > 0 && (
            <Card className="mb-6">
              <h3 className="mb-1 font-display text-sm font-bold">Rendimento netto annuo</h3>
              <p className="mb-3 text-xs text-muted">Solo dove dichiarato dal Prospetto ufficiale del fondo — mai ricalcolato da noi (i versamenti infra-annuali renderebbero un rendimento su saldo iniziale fuorviante).</p>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-muted">
                {fondi.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE_FONDI[i % PALETTE_FONDI.length] }} />
                    {f.nome}
                  </span>
                ))}
              </div>
              <GraficoRendimentoFondi anni={anniRendimento} fondiOrdinati={fondi} />
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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {fondi.map((f) => {
            const versamenti = versamentiPerFondo.get(f.id) ?? [];
            const perAnnoTipo = new Map();
            const tipiPresenti = new Set();
            for (const v of versamenti) {
              tipiPresenti.add(v.tipo_versamento);
              const curTipo = perAnnoTipo.get(v.anno_competenza) ?? new Map();
              curTipo.set(v.tipo_versamento, (curTipo.get(v.tipo_versamento) ?? 0) + Number(v.importo_eur));
              perAnnoTipo.set(v.anno_competenza, curTipo);
            }
            const tipiOrdinati = TIPO_VERSAMENTO_ORDINE.filter((t) => tipiPresenti.has(t));
            const posizione = posizionePerFondo.get(f.id);
            return (
              <div key={f.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-bold">{f.nome}</h3>
                  <span className="text-right text-xs text-muted">
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
                {tipiOrdinati.length > 1 && (
                  <Card>
                    <h4 className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted">Composizione versamenti per anno</h4>
                    <GraficoContributiFondo perAnno={perAnnoTipo} tipiPresenti={tipiOrdinati} />
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

// Tutti i grafici sotto sono HTML/CSS puro (barre = div con altezza in %),
// non SVG con preserveAspectRatio="none": su un contenitore molto più largo
// che alto (tipico di un dashboard desktop) quella modalità scala il testo in
// modo non uniforme e lo schiaccia — bug scoperto perché le etichette anno
// erano illeggibili. Con barre HTML il testo (valori, anni, legenda) è sempre
// normale indipendentemente dalla larghezza del contenitore.

// Barre impilate per anno: ogni colonna è un anno, i segmenti sono i singoli
// fondi (ultimo controvalore noto entro quell'anno_effettivo — vedi sopra).
// Totale sempre in etichetta sopra la barra (non solo al passaggio del mouse).
function BarreControvaloreFondi({ anni, fondiOrdinati, altezza = 180 }) {
  const [hover, setHover] = useState(null);
  const totaliPerAnno = anni.map((a) => fondiOrdinati.reduce((s, f) => s + (a.valori.get(f.id) ?? 0), 0));
  const max = Math.max(...totaliPerAnno, 1);

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
      <div className="mb-2 min-h-[1.25rem] text-xs">
        {hover !== null ? (
          <span className="font-semibold">
            <span className="text-ink">{anni[hover].anno}</span>
            {" — "}
            {fondiOrdinati.map((f) => {
              const v = anni[hover].valori.get(f.id);
              return v ? `${f.nome}: ${fmtEur(v)}` : null;
            }).filter(Boolean).join(" · ")}
            {" · "}Totale {fmtEur(totaliPerAnno[hover])}
          </span>
        ) : <span className="text-muted">Passa il mouse su una colonna per il dettaglio</span>}
      </div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height: altezza + 44 }}>
        {anni.map((a, i) => {
          const totale = totaliPerAnno[i];
          return (
            <div
              key={a.anno}
              className="flex flex-1 flex-col items-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="mb-1 whitespace-nowrap text-xs font-bold">{fmtEurCompatto(totale)}</div>
              <div className="flex w-full max-w-[72px] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: altezza }}>
                {fondiOrdinati.map((f, fi) => {
                  const v = a.valori.get(f.id) ?? 0;
                  if (v <= 0) return null;
                  return (
                    <div key={f.id} style={{ height: `${(v / max) * 100}%`, background: PALETTE_FONDI[fi % PALETTE_FONDI.length] }} />
                  );
                })}
              </div>
              <div className="mt-1.5 text-xs font-semibold text-muted">{a.anno}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rendimento netto per fondo per anno — SOLO quando la fonte ufficiale (Prospetto
// annuale) riporta il dato in rendimento_periodo_pct: mai ricalcolato da
// variazione-controvalore-meno-versamenti, che darebbe un numero sbagliato
// quando ci sono grossi versamenti infra-annuali (il rendimento reale è sulla
// giacenza media, non sul saldo iniziale — vedi migration 0047). Stesso asse
// anni del grafico controvalore (passato da fuori, non ricalcolato qui): un
// anno/fondo senza dato ufficiale mostra un trattino, non sparisce dall'asse —
// altrimenti "manca un anno" è indistinguibile da "il grafico ha un buco".
function BarreRendimentoFondi({ anni, fondiOrdinati, altezza = 140 }) {
  const [hover, setHover] = useState(null);
  const tutti = anni.flatMap((a) => [...a.rendimenti.values()]);
  const max = Math.max(...tutti, 1);

  return (
    <div>
      <div className="mb-2 min-h-[1.25rem] text-xs">
        {hover !== null ? (
          <span className="font-semibold">
            <span className="text-ink">{anni[hover].anno}</span>
            {" — "}
            {fondiOrdinati.map((f) => {
              const v = anni[hover].rendimenti.get(f.id);
              return `${f.nome}: ${v != null ? `+${v.toFixed(2)}%` : "n/d"}`;
            }).join(" · ")}
          </span>
        ) : <span className="text-muted">Passa il mouse su una colonna per il dettaglio</span>}
      </div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height: altezza + 44 }}>
        {anni.map((a, i) => (
          <div
            key={a.anno}
            className="flex flex-1 flex-col items-center"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex w-full max-w-[72px] items-end justify-center gap-1.5" style={{ height: altezza }}>
              {fondiOrdinati.map((f, fi) => {
                const v = a.rendimenti.get(f.id);
                if (v == null) {
                  return <div key={f.id} className="mb-0 h-0.5 w-3 self-end rounded-full bg-line" title="n/d" />;
                }
                return (
                  <div key={f.id} className="w-3 rounded-t-sm" style={{ height: `${Math.max((v / max) * 100, 3)}%`, background: PALETTE_FONDI[fi % PALETTE_FONDI.length] }} />
                );
              })}
            </div>
            <div className="mt-1.5 text-xs font-semibold text-muted">{a.anno}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Composizione dei versamenti di UN fondo per anno di competenza (personale /
// azienda / TFR / trasferimento) — stacked bar. Non specifico per nome fondo:
// si attiva per qualunque fondo con più di un tipo_versamento distinto (oggi
// solo Generali, che ha tutti e tre; AXA ha solo "volontario" quindi lo stack
// avrebbe un solo segmento — non renderizzato, non aggiunge informazione).
function BarreContributiFondo({ perAnno, tipiPresenti, altezza = 140 }) {
  const [hover, setHover] = useState(null);
  const anni = [...perAnno.keys()].sort((a, b) => a - b);
  const totali = anni.map((a) => tipiPresenti.reduce((s, t) => s + (perAnno.get(a).get(t) ?? 0), 0));
  const max = Math.max(...totali, 1);

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
      <div className="mb-2 min-h-[1.25rem] text-xs">
        {hover !== null ? (
          <span className="font-semibold">
            <span className="text-ink">{anni[hover]}</span>
            {" — "}
            {tipiPresenti.map((t) => {
              const v = perAnno.get(anni[hover]).get(t);
              return v ? `${TIPO_VERSAMENTO_LABEL[t] ?? t}: ${fmtEur(v)}` : null;
            }).filter(Boolean).join(" · ")}
          </span>
        ) : <span className="text-muted">Passa il mouse su una colonna per il dettaglio</span>}
      </div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height: altezza + 30 }}>
        {anni.map((anno, i) => {
          const valori = perAnno.get(anno);
          return (
            <div
              key={anno}
              className="flex flex-1 flex-col items-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex w-full max-w-[56px] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: altezza }}>
                {tipiPresenti.map((t) => {
                  const v = valori.get(t) ?? 0;
                  if (v <= 0) return null;
                  return <div key={t} style={{ height: `${(v / max) * 100}%`, background: PALETTE_TIPO_VERSAMENTO[t] }} />;
                })}
              </div>
              <div className="mt-1.5 text-xs font-semibold text-muted">{anno}</div>
            </div>
          );
        })}
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
  // Stesso asse anni del grafico controvalore (non solo gli anni con un
  // rendimento noto): un anno senza dato per un fondo mostra un trattino nel
  // grafico invece di sparire, altrimenti i due grafici affiancati avrebbero
  // colonne diverse e sarebbero impossibili da confrontare a colpo d'occhio.
  const anniRendimento = anni.map((a) => ({ anno: a.anno, rendimenti: perAnnoRendimento.get(a.anno) ?? new Map() }));
  const haRendimenti = anniRendimento.some((a) => a.rendimenti.size > 0);

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
            <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-display text-sm font-bold">Controvalore per fondo nel tempo</h3>
                <BarreControvaloreFondi anni={anni} fondiOrdinati={fondi} />
              </Card>
              {haRendimenti && (
                <Card>
                  <h3 className="mb-1 font-display text-sm font-bold">Rendimento netto annuo</h3>
                  <p className="mb-3 text-xs text-muted">Solo dove dichiarato dal Prospetto ufficiale — mai ricalcolato da noi (versamenti infra-annuali grossi renderebbero il calcolo fuorviante).</p>
                  <BarreRendimentoFondi anni={anniRendimento} fondiOrdinati={fondi} />
                </Card>
              )}
            </div>
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
                    <BarreContributiFondo perAnno={perAnnoTipo} tipiPresenti={tipiOrdinati} />
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

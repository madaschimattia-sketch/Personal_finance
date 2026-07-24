import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Chat() {
  const [messaggi, setMessaggi] = useState([]);
  const [input, setInput] = useState("");
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState("");
  const conversazioneId = useRef(null);
  const fineLista = useRef(null);

  async function caricaStorico() {
    const { data: conv } = await supabase.from("chat_conversazioni").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!conv) { conversazioneId.current = null; setMessaggi([]); return; }
    conversazioneId.current = conv.id;
    const { data } = await supabase.from("chat_messaggi").select("ruolo, contenuto").eq("conversazione_id", conv.id).order("created_at", { ascending: true });
    setMessaggi(data ?? []);
  }

  useEffect(() => { caricaStorico(); }, []);
  useEffect(() => { fineLista.current?.scrollIntoView({ block: "end" }); }, [messaggi]);

  function nuovaConversazione() {
    conversazioneId.current = null;
    setMessaggi([]);
  }

  async function invia(e) {
    e.preventDefault();
    const testo = input.trim();
    if (!testo) return;
    setErrore("");
    setInput("");
    setInviando(true);
    setMessaggi((m) => [...m, { ruolo: "user", contenuto: testo }]);
    try {
      const { data, error } = await supabase.functions.invoke("chat-assistente", { body: { messaggio: testo, conversazione_id: conversazioneId.current } });
      if (error) throw error;
      conversazioneId.current = data.conversazione_id;
      setMessaggi((m) => [...m, { ruolo: "assistant", contenuto: data.risposta }]);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setInviando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Assistente</h2>
        <button onClick={nuovaConversazione} className="rounded-chip border border-line px-3 py-1.5 text-sm font-semibold">Nuova conversazione</button>
      </div>
      <p className="mb-4 text-sm text-muted">
        Vede solo aggregati (patrimonio totale, imposte per anno, esito budget) — mai il dettaglio riga per riga. Non fornisce raccomandazioni di investimento specifiche.
      </p>

      <div className="mb-3 flex max-h-[50vh] min-h-[220px] flex-col gap-2.5 overflow-y-auto rounded-card border border-line bg-surface p-4">
        {messaggi.map((m, i) => (
          <div
            key={i}
            className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
              m.ruolo === "user" ? "self-end bg-hero text-white" : "self-start border border-line bg-bg"
            }`}
          >
            {m.contenuto}
          </div>
        ))}
        <div ref={fineLista} />
      </div>
      {errore && <p className="mb-2 text-sm text-neg">{errore}</p>}
      <form onSubmit={invia} className="flex items-start gap-2">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Scrivi un messaggio..."
          className="flex-1 rounded-chip border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button type="submit" disabled={inviando} className="rounded-chip bg-hero px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          Invia
        </button>
      </form>
    </div>
  );
}

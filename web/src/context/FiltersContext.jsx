import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

// Filtri globali condivisi da tutte le pagine: intestatario e periodo temporale.
// Oggi c'e' un solo intestatario con dati propri (Mattia), ma la lista viene
// letta dalla tabella (non hardcoded) cosi' un secondo intestatario con propri
// introiti/patrimonio comparirà nel selettore senza toccare il codice.
//
// Nota sui limiti reali del filtro intestatario: Portafoglio/patrimonio non sono
// oggi divisi per persona (tax_lots/tax_instruments non hanno un intestatario_id
// — sono dell'unico conto IBKR), quindi l'intestatario selezionato incide solo
// sulle pagine/sezioni legate al reddito o alle spese di una persona (Budget,
// Proiezioni, il riepilogo Utenze in Dashboard, la tabella "Subscription e spese
// fisse manuali" in Utenze — via spese_fisse_manuali.intestatario_id) — non sul
// valore del portafoglio, ne' sulle bollette di casa (utenze_bollette/domicili
// sono a livello di domicilio, non di persona).
const FiltersContext = createContext(null);

export const PERIODO_PRESET = [
  { label: "30gg", giorni: 30 },
  { label: "90gg", giorni: 90 },
  { label: "1 anno", giorni: 365 },
  { label: "Tutto", giorni: null },
];

// Unico intestatario con dati propri oggi (buste paga, portafoglio IBKR). Usato
// solo come default di selezione iniziale se presente in lista — un secondo
// intestatario (es. Martina) resta selezionabile dal menu ma non diventa il
// default finche' non avra' dati propri caricati.
const INTESTATARIO_DEFAULT = "37af7f90-79d8-42e6-b172-367ccbd38846";

export function FiltersProvider({ children }) {
  const [intestatari, setIntestatari] = useState([]);
  const [intestatarioId, setIntestatarioId] = useState(null);
  const [periodoGiorni, setPeriodoGiorni] = useState(90);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const { data } = await supabase.from("intestatari").select("id, nome, cognome").order("nome");
      if (annullato) return;
      const lista = data ?? [];
      setIntestatari(lista);
      const preferito = lista.find((i) => i.id === INTESTATARIO_DEFAULT)?.id;
      setIntestatarioId((prev) => prev ?? preferito ?? lista[0]?.id ?? null);
    })();
    return () => { annullato = true; };
  }, []);

  return (
    <FiltersContext.Provider value={{ intestatari, intestatarioId, setIntestatarioId, periodoGiorni, setPeriodoGiorni }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters va usato dentro <FiltersProvider>");
  return ctx;
}

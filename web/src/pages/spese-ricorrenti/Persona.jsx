import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import SpeseFisseTable from "../../components/SpeseFisseTable.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";
import { CATEGORIE_SPESE_PERSONA } from "../../lib/categorie.js";

export default function Persona() {
  const { intestatarioId } = useFilters();
  const [stato, setStato] = useState("loading");
  const [righe, setRighe] = useState([]);

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        const { data, error } = await supabase.from("spese_fisse_manuali")
          .select("nome, categoria, importo, frequenza, attivo, data_inizio")
          .in("categoria", CATEGORIE_SPESE_PERSONA)
          .eq("intestatario_id", intestatarioId)
          .order("categoria");
        if (error) throw error;
        if (!annullato) {
          setRighe(data ?? []);
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
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento di Persona.</p>;

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Persona</h2>
      <p className="mb-6 text-sm text-muted">
        Subscription, assicurazioni personali, finanziamenti e altre spese fisse individuali.
      </p>
      <SpeseFisseTable righe={righe} mostraCategoria />
    </div>
  );
}

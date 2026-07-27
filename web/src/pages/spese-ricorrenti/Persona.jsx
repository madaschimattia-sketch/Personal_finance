import { useEffect, useState } from "react";
import SpeseFisseTable from "../../components/SpeseFisseTable.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";
import { CATEGORIE_SPESE_PERSONA } from "../../lib/categorie.js";
import { caricaSpeseFisseConQuota } from "../../lib/spesaFissa.js";

export default function Persona() {
  const { intestatari, intestatarioId } = useFilters();
  const [stato, setStato] = useState("loading");
  const [righe, setRighe] = useState([]);

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        const data = await caricaSpeseFisseConQuota(CATEGORIE_SPESE_PERSONA, intestatarioId, intestatari);
        if (!annullato) {
          setRighe(data);
          setStato("ready");
        }
      } catch (e) {
        console.error(e);
        if (!annullato) setStato("error");
      }
    })();
    return () => { annullato = true; };
  }, [intestatarioId, intestatari]);

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

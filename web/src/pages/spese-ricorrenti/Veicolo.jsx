import { useEffect, useState } from "react";
import SpeseFisseTable from "../../components/SpeseFisseTable.jsx";
import { useFilters } from "../../context/FiltersContext.jsx";
import { CATEGORIE_SPESE_VEICOLO } from "../../lib/categorie.js";
import { caricaSpeseFisseConQuota } from "../../lib/spesaFissa.js";

export default function Veicolo() {
  const { intestatari, intestatarioId } = useFilters();
  const [stato, setStato] = useState("loading");
  const [righe, setRighe] = useState([]);

  useEffect(() => {
    if (!intestatarioId) return;
    let annullato = false;
    (async () => {
      try {
        const data = await caricaSpeseFisseConQuota(CATEGORIE_SPESE_VEICOLO, intestatarioId, intestatari);
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
  if (stato === "error") return <p className="text-sm text-neg">Errore nel caricamento di Veicolo.</p>;

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold tracking-tight">Veicolo</h2>
      <p className="mb-6 text-sm text-muted">
        Bollo, RC auto, manutenzione ordinaria — costi fissi personali, non legati al domicilio.
      </p>
      <SpeseFisseTable righe={righe} mostraCategoria />
    </div>
  );
}

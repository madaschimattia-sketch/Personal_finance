import Card from "./Card.jsx";
import { fmtEur } from "../lib/format.js";
import { CATEGORIA_LABEL } from "../lib/categorie.js";

export default function SpeseFisseTable({ righe, mostraCategoria = false }) {
  if (righe.length === 0) return <p className="text-sm text-muted">Nessuna riga registrata.</p>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 font-semibold">Nome</th>
            {mostraCategoria && <th className="px-5 py-3 font-semibold">Categoria</th>}
            <th className="px-5 py-3 font-semibold">Importo</th>
            <th className="px-5 py-3 font-semibold">Frequenza</th>
            <th className="px-5 py-3 font-semibold">Stato</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((s, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="px-5 py-2.5 font-bold">
                {s.nome}
                {s.notaCointestazione && <div className="mt-0.5 text-xs font-normal text-muted">{s.notaCointestazione}</div>}
              </td>
              {mostraCategoria && <td className="px-5 py-2.5 text-muted">{CATEGORIA_LABEL[s.categoria] ?? s.categoria}</td>}
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
  );
}

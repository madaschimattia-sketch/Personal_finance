// Budget — sostenibilita' costi fissi (utenze_bollette + spese_fisse_manuali) vs
// reddito (introiti_buste_paga). Invoca calcola-budget-sostenibilita (JWT, reporting
// puro, non scrive nulla) e mostra il risultato.
//
// Oggi solo Mattia Madaschi ha buste paga caricate: l'analisi ha senso solo per chi
// ha un reddito da confrontare, quindi l'intestatario e' fisso qui. Se in futuro anche
// Martina avra' introiti_buste_paga, questo andra' sostituito con un selettore (stesso
// pattern del selettore anno in fiscale.js).
const BUDGET_INTESTATARIO_ID = "37af7f90-79d8-42e6-b172-367ccbd38846";

const CATEGORIA_LABEL = {
  luce: "Luce",
  gas: "Gas",
  acqua: "Acqua",
  internet_telefono: "Internet/telefono",
  affitto: "Affitto",
  condominio: "Condominio",
  streaming: "Streaming",
  software: "Software",
  fitness: "Fitness",
  veicolo: "Veicolo",
  assicurazione: "Assicurazione",
  bancario: "Bancario",
  altro: "Altro",
};

const GIUDIZIO_LABEL = { sostenibile: "Sostenibile", attenzione: "Attenzione", rischio: "A rischio" };
const GIUDIZIO_CLASSE = { sostenibile: "positivo", attenzione: "avviso", rischio: "negativo" };
const DIREZIONE_LABEL = { migliora: "In miglioramento", peggiora: "In peggioramento", stabile: "Stabile", dati_insufficienti: "Dati insufficienti" };

function fmtPct(valore) {
  return `${valore.toFixed(1)}%`;
}

function renderBudget(risultato, nota) {
  const contenitore = document.getElementById("budget-contenuto");
  if (nota) {
    contenitore.innerHTML = `<p class="nota">${nota}</p>`;
    return;
  }
  const r = risultato;
  const giudizioClasse = GIUDIZIO_CLASSE[r.giudizio] ?? "";
  const righeCategorie = [...r.costiPerCategoria].sort((a, b) => b.costoMensileEquivalente - a.costoMensileEquivalente).map((c) => `
    <tr>
      <td>${CATEGORIA_LABEL[c.categoria] ?? c.categoria}</td>
      <td>${fmtEur(c.costoMensileEquivalente)}</td>
      <td>${c.numeroRighe}</td>
    </tr>
  `).join("");

  contenitore.innerHTML = `
    <div class="budget-riepilogo">
      <div class="budget-card">
        <span class="nota">Costi fissi mensili</span>
        <strong>${fmtEur(r.costiFissiMensiliTotali)}</strong>
      </div>
      <div class="budget-card">
        <span class="nota">Reddito ricorrente mensile (mediana)</span>
        <strong>${fmtEur(r.redditoRicorrenteMensile)}</strong>
      </div>
      <div class="budget-card">
        <span class="nota">Rapporto costi/reddito</span>
        <strong class="${giudizioClasse}">${fmtPct(r.rapportoPct)} — ${GIUDIZIO_LABEL[r.giudizio] ?? r.giudizio}</strong>
      </div>
      <div class="budget-card">
        <span class="nota">Margine mensile</span>
        <strong>${fmtEur(r.margineMensile)}</strong>
      </div>
    </div>

    <p class="nota">
      Reddito medio annualizzato (include tredicesima/bonus): ${fmtEur(r.redditoMedioAnnualizzato)}/mese.
      Fondo emergenza target: ${fmtEur(r.fondoEmergenzaTargetMinEur)} – ${fmtEur(r.fondoEmergenzaTargetMaxEur)}
      (3-6 mesi di costi fissi).
      ${r.righeBolletteEscluse > 0 ? `${r.righeBolletteEscluse} riga/e esclusa/e dal calcolo (frequenza non ricorrente).` : ""}
    </p>

    <h2>Costi fissi per categoria</h2>
    <table class="tabella-dati">
      <thead><tr><th>Categoria</th><th>Costo mensile equivalente</th><th>Righe</th></tr></thead>
      <tbody>${righeCategorie}</tbody>
      <tfoot><tr><th>Totale</th><th>${fmtEur(r.costiFissiMensiliTotali)}</th><th></th></tr></tfoot>
    </table>

    <h2>Trend</h2>
    <p class="nota">
      Rapporto costi/reddito: prima meta' del periodo osservato
      ${r.trend.rapportoPctPrimaMeta !== null ? fmtPct(r.trend.rapportoPctPrimaMeta) : "-"},
      seconda meta' ${r.trend.rapportoPctSecondaMeta !== null ? fmtPct(r.trend.rapportoPctSecondaMeta) : "-"}
      → ${DIREZIONE_LABEL[r.trend.direzione] ?? r.trend.direzione}.
    </p>
  `;
}

async function caricaBudget() {
  const contenitore = document.getElementById("budget-contenuto");
  const statoEl = document.getElementById("budget-stato");
  contenitore.innerHTML = `<p class="nota">Caricamento...</p>`;
  statoEl.textContent = "";
  try {
    const data = await invokeFunction("calcola-budget-sostenibilita", { intestatario_id: BUDGET_INTESTATARIO_ID });
    if (!data.risultato) {
      renderBudget(null, data.nota ?? "Nessun dato disponibile.");
      return;
    }
    renderBudget(data.risultato, null);
  } catch (e) {
    contenitore.innerHTML = `<p class="errore">Errore: ${e.message}</p>`;
  }
}

async function initBudget() {
  await caricaBudget();
  document.getElementById("btn-ricalcola-budget").addEventListener("click", async () => {
    document.getElementById("budget-stato").textContent = "Ricalcolo in corso...";
    await caricaBudget();
    document.getElementById("budget-stato").textContent = "Aggiornato.";
  });
}

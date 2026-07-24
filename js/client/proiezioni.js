// Proiezioni interattive (Fase 5 — ESPERTO DI FINANZA, blocco 2). Calcolo puro
// client-side (nessuna scrittura, nessun dato sensibile da proteggere oltre a
// quello gia' letto via RLS): valore iniziale + rendimento atteso + contributo
// mensile + orizzonte, tutti modificabili dall'utente in tempo reale.
//
// Rendimento atteso di default = media pesata delle ipotesi di mercato per
// categoria (config_rendimenti_attesi) sull'ALLOCAZIONE ATTUALE del portafoglio
// (ultimo snapshot conto_nav_giornaliero) — non una previsione certa, solo un
// punto di partenza dichiarato e modificabile. Il contributo mensile di default
// e' il margine mensile calcolato in Fase 4 (calcola-budget-sostenibilita).
const PROIEZIONI_INTESTATARIO_ID = "37af7f90-79d8-42e6-b172-367ccbd38846";
const PROIEZIONI_CATEGORIE = ["cash", "stock", "bonds", "funds", "commodities", "crypto"];
const PROIEZIONI_ANNI_MAX = 40;

let proiezioniChart = null;

function calcolaSerie(valoreIniziale, rendimentoPct, contributoMensile, anni) {
  const rendimentoAnnuo = rendimentoPct / 100;
  const tassoMensile = Math.pow(1 + rendimentoAnnuo, 1 / 12) - 1;
  const serie = [];
  for (let anno = 0; anno <= anni; anno++) {
    const mesi = anno * 12;
    let valore;
    if (tassoMensile === 0) {
      valore = valoreIniziale + contributoMensile * mesi;
    } else {
      valore = valoreIniziale * Math.pow(1 + tassoMensile, mesi)
        + contributoMensile * ((Math.pow(1 + tassoMensile, mesi) - 1) / tassoMensile);
    }
    serie.push(valore);
  }
  return serie;
}

function disegnaGrafico(serie) {
  const ctx = document.getElementById("proiezioni-grafico");
  const labels = serie.map((_, i) => `Anno ${i}`);
  if (proiezioniChart) {
    proiezioniChart.data.labels = labels;
    proiezioniChart.data.datasets[0].data = serie;
    proiezioniChart.update();
    return;
  }
  proiezioniChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Patrimonio proiettato (EUR)", data: serie, borderColor: "#4f8cff", backgroundColor: "rgba(79,140,255,0.15)", fill: true, tension: 0.15 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: (v) => fmtEur(v) } } },
    },
  });
}

function ricalcolaProiezione() {
  const valoreIniziale = Number(document.getElementById("proiezioni-valore-iniziale").value) || 0;
  const rendimentoPct = Number(document.getElementById("proiezioni-rendimento").value) || 0;
  const contributoMensile = Number(document.getElementById("proiezioni-contributo").value) || 0;
  const anni = Number(document.getElementById("proiezioni-anni").value) || 0;

  document.getElementById("proiezioni-rendimento-val").textContent = `${rendimentoPct.toFixed(1)}%`;
  document.getElementById("proiezioni-anni-val").textContent = `${anni} anni`;

  const serie = calcolaSerie(valoreIniziale, rendimentoPct, contributoMensile, anni);
  const finale = serie[serie.length - 1];
  const versato = valoreIniziale + contributoMensile * anni * 12;
  document.getElementById("proiezioni-risultato").innerHTML = `
    Patrimonio proiettato tra ${anni} anni: <strong>${fmtEur(finale)}</strong>
    (di cui versato/iniziale ${fmtEur(versato)}, crescita stimata ${fmtEur(finale - versato)}).
  `;
  disegnaGrafico(serie);
}

async function initProiezioni() {
  const infoEl = document.getElementById("proiezioni-info");

  const [{ data: nav }, { data: rendimenti }] = await Promise.all([
    supabaseClient.from("conto_nav_giornaliero")
      .select("report_date, cash_eur, stock_eur, bonds_eur, funds_eur, commodities_eur, crypto_eur, total_eur")
      .order("report_date", { ascending: false }).limit(1).maybeSingle(),
    supabaseClient.from("config_rendimenti_attesi").select("categoria, rendimento_atteso_pct"),
  ]);

  let cagrDefault = 5;
  let valoreIniziale = 0;
  if (nav && Number(nav.total_eur) > 0) {
    valoreIniziale = Number(nav.total_eur);
    const rendimentoPerCategoria = new Map((rendimenti ?? []).map((r) => [r.categoria, Number(r.rendimento_atteso_pct)]));
    let sommaPesata = 0;
    for (const cat of PROIEZIONI_CATEGORIE) {
      const valoreCategoria = Number(nav[`${cat}_eur`] ?? 0);
      sommaPesata += valoreCategoria * (rendimentoPerCategoria.get(cat) ?? 0);
    }
    cagrDefault = sommaPesata / valoreIniziale;
    infoEl.textContent = `Valore iniziale e allocazione dall'ultimo snapshot patrimonio (${nav.report_date}). Rendimento atteso stimato pesando l'allocazione attuale con le ipotesi di mercato per categoria — modificabile liberamente qui sotto.`;
  } else {
    infoEl.textContent = "Nessuno snapshot patrimonio disponibile: valore iniziale e rendimento di default a 0, inseriscili a mano.";
  }

  let contributoDefault = 0;
  try {
    const budget = await invokeFunction("calcola-budget-sostenibilita", { intestatario_id: PROIEZIONI_INTESTATARIO_ID });
    if (budget.risultato) contributoDefault = Math.max(0, Math.round(budget.risultato.margineMensile));
  } catch (_) {
    // margine non disponibile: default 0, l'utente lo imposta a mano
  }

  document.getElementById("proiezioni-valore-iniziale").value = Math.round(valoreIniziale);
  document.getElementById("proiezioni-rendimento").value = cagrDefault.toFixed(1);
  document.getElementById("proiezioni-contributo").value = contributoDefault;
  document.getElementById("proiezioni-anni").max = PROIEZIONI_ANNI_MAX;
  document.getElementById("proiezioni-anni").value = 20;

  ["proiezioni-valore-iniziale", "proiezioni-rendimento", "proiezioni-contributo", "proiezioni-anni"].forEach((id) => {
    document.getElementById(id).addEventListener("input", ricalcolaProiezione);
  });
  ricalcolaProiezione();
}

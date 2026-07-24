// Proiezioni interattive (Fase 5 — ESPERTO DI FINANZA, blocco 2). Calcolo puro
// client-side (nessuna scrittura, nessun dato sensibile da proteggere oltre a
// quello gia' letto via RLS): valore iniziale + rendimento atteso + contributo
// mensile + orizzonte, tutti modificabili dall'utente in tempo reale.
//
// Rendimento atteso di default = media pesata, per il VALORE DI POSIZIONE
// ATTUALE di ogni strumento, del suo CAGR storico reale (tax_instruments.
// rendimento_5y_pct, calcolato da calcola-rendimenti-storici sui prezzi Yahoo
// Finance) — dove non disponibile (ticker non risolto, storico insufficiente),
// fallback sull'ipotesi generica di mercato per categoria
// (config_rendimenti_attesi). Non una previsione certa, solo un punto di
// partenza dichiarato e modificabile. Il contributo mensile di default e' il
// margine mensile calcolato in Fase 4 (calcola-budget-sostenibilita).
const PROIEZIONI_INTESTATARIO_ID = "37af7f90-79d8-42e6-b172-367ccbd38846";
const PROIEZIONI_ANNI_MAX = 40;
const CATEGORIA_IBKR_TO_CONFIG = { STK: "stock", BOND: "bonds", FUND: "funds", CMDTY: "commodities", CRYPTO: "crypto" };

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

async function caricaDefaultPortafoglio() {
  const infoEl = document.getElementById("proiezioni-info");

  const [{ data: nav }, { data: rendimentiCategoria }] = await Promise.all([
    supabaseClient.from("conto_nav_giornaliero")
      .select("report_date, cash_eur, total_eur")
      .order("report_date", { ascending: false }).limit(1).maybeSingle(),
    supabaseClient.from("config_rendimenti_attesi").select("categoria, rendimento_atteso_pct"),
  ]);

  let cagrDefault = 5;
  let valoreIniziale = 0;
  if (nav && Number(nav.total_eur) > 0) {
    valoreIniziale = Number(nav.total_eur);
    const rendimentoPerCategoria = new Map((rendimentiCategoria ?? []).map((r) => [r.categoria, Number(r.rendimento_atteso_pct)]));

    const { data: dataUltima } = await supabaseClient.from("posizioni_aperte_ibkr")
      .select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
    let posizioni = [];
    if (dataUltima) {
      const { data } = await supabaseClient.from("posizioni_aperte_ibkr")
        .select("conid, asset_category, position_value_eur").eq("report_date", dataUltima.report_date);
      posizioni = data ?? [];
    }
    const conidUnici = [...new Set(posizioni.map((p) => p.conid))];
    const { data: strumenti } = conidUnici.length > 0
      ? await supabaseClient.from("tax_instruments").select("conid, rendimento_5y_pct").in("conid", conidUnici)
      : { data: [] };
    const rendimentoPerConid = new Map((strumenti ?? []).map((s) => [s.conid, s.rendimento_5y_pct != null ? Number(s.rendimento_5y_pct) : null]));

    let sommaPesata = Number(nav.cash_eur ?? 0) * (rendimentoPerCategoria.get("cash") ?? 0);
    let nReale = 0, nFallback = 0;
    for (const p of posizioni) {
      const valore = Number(p.position_value_eur ?? 0);
      const rendimentoReale = rendimentoPerConid.get(p.conid);
      if (rendimentoReale != null) {
        sommaPesata += valore * rendimentoReale;
        nReale++;
      } else {
        const rendimentoFallback = rendimentoPerCategoria.get(CATEGORIA_IBKR_TO_CONFIG[p.asset_category]) ?? 0;
        sommaPesata += valore * rendimentoFallback;
        nFallback++;
      }
    }
    cagrDefault = sommaPesata / valoreIniziale;
    infoEl.textContent = `Valore iniziale dall'ultimo snapshot patrimonio (${nav.report_date}). Rendimento atteso: media pesata per valore di posizione, ${nReale} strumento/i con CAGR storico reale (~5 anni) e ${nFallback} su ipotesi generica per categoria — modificabile liberamente qui sotto.`;
  } else {
    infoEl.textContent = "Nessuno snapshot patrimonio disponibile: valore iniziale e rendimento di default a 0, inseriscili a mano.";
  }

  return { valoreIniziale, cagrDefault };
}

async function initProiezioni() {
  const { valoreIniziale, cagrDefault } = await caricaDefaultPortafoglio();

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

  document.getElementById("btn-ricalcola-rendimenti").addEventListener("click", async () => {
    const statoEl = document.getElementById("proiezioni-stato-rendimenti");
    statoEl.textContent = "Ricalcolo rendimenti storici in corso (può richiedere qualche secondo)...";
    try {
      const risultato = await invokeFunction("calcola-rendimenti-storici", {});
      const dettaglio = risultato.dettaglio ?? {};
      const nOk = Object.values(dettaglio).filter((d) => !d.skipped).length;
      const nSkip = Object.values(dettaglio).filter((d) => d.skipped).length;
      statoEl.textContent = `Fatto: ${nOk} strumento/i aggiornati, ${nSkip} saltati (vedi console per il dettaglio).`;
      console.log("calcola-rendimenti-storici:", dettaglio);
      const { cagrDefault: nuovoCagr } = await caricaDefaultPortafoglio();
      document.getElementById("proiezioni-rendimento").value = nuovoCagr.toFixed(1);
      ricalcolaProiezione();
    } catch (err) {
      statoEl.textContent = `Errore: ${err.message}`;
    }
  });
}

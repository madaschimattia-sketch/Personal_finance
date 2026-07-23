// Portafoglio — aggregazione client-side di tax_lots aperti + valore attuale
// dall'ultimo snapshot posizioni_aperte_ibkr (nessuna edge function dedicata: sono
// tutte tabelle normali protette da RLS, la select diretta basta).
async function initPortafoglio() {
  const infoEl = document.getElementById("portafoglio-info");
  const righeEl = document.getElementById("portafoglio-righe");

  const [{ data: lotti, error: erroreLotti }, { data: strumenti, error: erroreStrumenti }] = await Promise.all([
    supabaseClient.from("tax_lots").select("instrument_id, quantita_residua, costo_unitario_eur").eq("stato", "aperto"),
    supabaseClient.from("tax_instruments").select("id, symbol, descrizione, asset_category, isin, conid"),
  ]);
  if (erroreLotti || erroreStrumenti) {
    righeEl.innerHTML = `<tr><td colspan="6">Errore: ${(erroreLotti || erroreStrumenti).message}</td></tr>`;
    return;
  }

  const { data: dataUltima } = await supabaseClient
    .from("posizioni_aperte_ibkr").select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
  const ultimaData = dataUltima?.report_date ?? null;

  let posizioni = [];
  if (ultimaData) {
    const { data } = await supabaseClient
      .from("posizioni_aperte_ibkr").select("isin, conid, mark_price, position_value_eur")
      .eq("report_date", ultimaData);
    posizioni = data ?? [];
  }
  const posizionePerIsin = new Map(posizioni.filter((p) => p.isin).map((p) => [p.isin, p]));
  const posizionePerConid = new Map(posizioni.map((p) => [p.conid, p]));
  const strumentoPerId = new Map(strumenti.map((s) => [s.id, s]));

  const aggregati = new Map();
  for (const lotto of lotti) {
    const chiave = lotto.instrument_id;
    const esistente = aggregati.get(chiave) ?? { quantita: 0, costo: 0 };
    esistente.quantita += Number(lotto.quantita_residua);
    esistente.costo += Number(lotto.quantita_residua) * Number(lotto.costo_unitario_eur);
    aggregati.set(chiave, esistente);
  }

  const righe = [...aggregati.entries()].map(([instrumentId, agg]) => {
    const strumento = strumentoPerId.get(instrumentId);
    const posizione = strumento?.isin ? posizionePerIsin.get(strumento.isin) : posizionePerConid.get(strumento?.conid);
    const valoreAttuale = posizione ? Number(posizione.position_value_eur) : null;
    return {
      symbol: strumento?.symbol ?? "?",
      assetClass: strumento?.asset_category ?? "-",
      quantita: agg.quantita,
      costo: agg.costo,
      valoreAttuale,
      plNonRealizzato: valoreAttuale !== null ? valoreAttuale - agg.costo : null,
    };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));

  infoEl.textContent = ultimaData
    ? `Valori attuali dall'ultimo snapshot disponibile (${ultimaData}) — non prezzi live.`
    : "Nessuno snapshot posizioni disponibile: solo quantità/costo.";

  righeEl.innerHTML = righe.map((r) => `
    <tr>
      <td>${r.symbol}</td>
      <td>${r.assetClass}</td>
      <td>${r.quantita}</td>
      <td>${fmtEur(r.costo)}</td>
      <td>${r.valoreAttuale !== null ? fmtEur(r.valoreAttuale) : "-"}</td>
      <td class="${r.plNonRealizzato > 0 ? "positivo" : r.plNonRealizzato < 0 ? "negativo" : ""}">${r.plNonRealizzato !== null ? fmtEur(r.plNonRealizzato) : "-"}</td>
    </tr>
  `).join("");

  const totaleCosto = righe.reduce((s, r) => s + r.costo, 0);
  const totaleValore = righe.reduce((s, r) => s + (r.valoreAttuale ?? 0), 0);
  document.getElementById("portafoglio-totali").innerHTML = `
    <tr>
      <th colspan="3">Totale</th>
      <th>${fmtEur(totaleCosto)}</th>
      <th>${fmtEur(totaleValore)}</th>
      <th>${fmtEur(totaleValore - totaleCosto)}</th>
    </tr>
  `;
}

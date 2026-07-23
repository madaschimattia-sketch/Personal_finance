// Dichiarazione fiscale — legge tax_events per anno (gia' calcolati) e permette di
// ricalcolarli invocando le 4 edge function (RT/RM/RW/RP), ognuna per l'anno scelto.
const QUADRI_LABEL = { RT: "RT — Redditi diversi (plus/minusvalenze)", RM: "RM — Redditi di capitale", RW: "RW — IVAFE", RP: "RP — Fondo pensione" };

async function caricaEventiFiscali(anno) {
  const { data, error } = await supabaseClient.from("tax_events").select("*").eq("anno", anno).order("quadro").order("tipo");
  const contenitore = document.getElementById("fiscale-quadri");
  if (error) {
    contenitore.innerHTML = `<p class="errore">Errore: ${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    contenitore.innerHTML = `<p class="nota">Nessun evento fiscale per il ${anno}. Premi "Ricalcola".</p>`;
    return;
  }
  const perQuadro = new Map();
  for (const ev of data) {
    if (!perQuadro.has(ev.quadro)) perQuadro.set(ev.quadro, []);
    perQuadro.get(ev.quadro).push(ev);
  }
  contenitore.innerHTML = [...perQuadro.entries()].map(([quadro, eventi]) => {
    const totaleImposta = eventi.reduce((s, e) => s + Number(e.imposta_eur), 0);
    return `
      <h2>${QUADRI_LABEL[quadro] ?? quadro}</h2>
      <table class="tabella-dati">
        <thead><tr><th>Tipo</th><th>Imponibile</th><th>Aliquota</th><th>Imposta</th><th>Note</th></tr></thead>
        <tbody>
          ${eventi.map((e) => `
            <tr>
              <td>${e.tipo}</td>
              <td>${fmtEur(Number(e.imponibile_eur))}</td>
              <td>${e.aliquota_pct !== null ? e.aliquota_pct + "%" : "-"}</td>
              <td>${fmtEur(Number(e.imposta_eur))}</td>
              <td class="nota">${e.note ?? ""}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot><tr><th colspan="3">Totale imposta ${quadro}</th><th colspan="2">${fmtEur(totaleImposta)}</th></tr></tfoot>
      </table>
    `;
  }).join("");
}

async function initFiscale() {
  const annoEl = document.getElementById("fiscale-anno");
  const statoEl = document.getElementById("fiscale-stato");

  annoEl.addEventListener("change", () => caricaEventiFiscali(Number(annoEl.value)));
  await caricaEventiFiscali(Number(annoEl.value));

  document.getElementById("btn-ricalcola").addEventListener("click", async () => {
    const anno = Number(annoEl.value);
    statoEl.textContent = "Ricalcolo in corso...";
    const funzioni = ["calcola-quadro-rt", "calcola-quadro-rm", "calcola-quadro-rw", "calcola-fondo-pensione"];
    const risultati = [];
    for (const nome of funzioni) {
      try {
        await invokeFunction(nome, { anno });
        risultati.push(`${nome}: ok`);
      } catch (e) {
        risultati.push(`${nome}: ${e.message}`);
      }
    }
    statoEl.textContent = risultati.join(" | ");
    await caricaEventiFiscali(anno);
  });
}

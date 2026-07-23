// estrai-bolletta — Estrae i campi strutturati da un PDF di bolletta/fattura gia'
// archiviato in documenti_grezzi (sezione='utenze') e popola utenze_bollette.
//
// Non fa sync da Drive (vedi ROADMAP.md per lo stato di quella parte): il chiamante
// deve gia' aver caricato il PDF su Storage e creato la riga documenti_grezzi (upload
// manuale, o un futuro job di sync). categoria/domicilio_id sono passati dal chiamante
// (metadati organizzativi noti da dove arriva il file), non inferiti dal contenuto PDF.
//
// JWT-protected, per utente. Richiede il secret ANTHROPIC_API_KEY su questo progetto
// Supabase (Dashboard -> Edge Functions -> Secrets, o `supabase secrets set`).
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { buildAnthropicRequest, parseAnthropicResponse } from "../_shared/estrazione-bolletta.ts";

const CATEGORIE_VALIDE = ["luce", "gas", "acqua", "internet_telefono", "condominio", "affitto"];
const MODEL = "claude-haiku-4-5";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Authorization mancante" });

    const admin = createAdminClient();
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json(401, { error: "Token non valido" });
    const userId = userData.user.id;

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json(500, { error: "ANTHROPIC_API_KEY non configurata su questo progetto" });

    const body = await req.json().catch(() => ({}));
    const documentoGrezzoId: string | undefined = body?.documento_grezzo_id;
    const domicilioId: string | undefined = body?.domicilio_id;
    const categoria: string | undefined = body?.categoria;
    if (!documentoGrezzoId) return json(400, { error: "Parametro 'documento_grezzo_id' mancante" });
    if (!domicilioId) return json(400, { error: "Parametro 'domicilio_id' mancante" });
    if (!categoria || !CATEGORIE_VALIDE.includes(categoria)) {
      return json(400, { error: `Parametro 'categoria' mancante o non valido (valori ammessi: ${CATEGORIE_VALIDE.join(", ")})` });
    }

    const { data: documento, error: docErr } = await admin
      .from("documenti_grezzi")
      .select("id, storage_path, sezione")
      .eq("id", documentoGrezzoId)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr) return json(500, { error: `Lettura documento_grezzo fallita: ${docErr.message}` });
    if (!documento) return json(404, { error: "documento_grezzo non trovato per questo utente" });
    if (documento.sezione !== "utenze") {
      return json(400, { error: `documento_grezzo.sezione='${documento.sezione}', atteso 'utenze'` });
    }

    const { data: domicilio, error: domErr } = await admin
      .from("domicili")
      .select("id")
      .eq("id", domicilioId)
      .eq("user_id", userId)
      .maybeSingle();
    if (domErr) return json(500, { error: `Lettura domicilio fallita: ${domErr.message}` });
    if (!domicilio) return json(404, { error: "domicilio non trovato per questo utente" });

    const { data: pdfBlob, error: downloadErr } = await admin.storage
      .from("documenti-grezzi")
      .download(documento.storage_path);
    if (downloadErr || !pdfBlob) {
      await admin.from("documenti_grezzi").update({
        stato_elaborazione: "errore",
        errore_dettaglio: `Download Storage fallito: ${downloadErr?.message ?? "blob vuoto"}`,
      }).eq("id", documentoGrezzoId);
      return json(500, { error: `Download da Storage fallito: ${downloadErr?.message ?? "blob vuoto"}` });
    }
    const pdfBase64 = arrayBufferToBase64(await pdfBlob.arrayBuffer());

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(buildAnthropicRequest(pdfBase64, categoria, MODEL)),
    });
    if (!anthropicRes.ok) {
      const dettaglio = await anthropicRes.text();
      await admin.from("documenti_grezzi").update({
        stato_elaborazione: "errore",
        errore_dettaglio: `Anthropic API ${anthropicRes.status}: ${dettaglio.slice(0, 500)}`,
      }).eq("id", documentoGrezzoId);
      return json(502, { error: `Anthropic API ha risposto ${anthropicRes.status}`, dettaglio });
    }
    const anthropicBody = await anthropicRes.json();

    let campi;
    try {
      campi = parseAnthropicResponse(anthropicBody);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("documenti_grezzi").update({
        stato_elaborazione: "errore",
        errore_dettaglio: `Parsing estrazione fallito: ${message}`,
      }).eq("id", documentoGrezzoId);
      return json(500, { error: message });
    }

    const { data: bolletta, error: insertErr } = await admin
      .from("utenze_bollette")
      .insert({
        user_id: userId,
        domicilio_id: domicilioId,
        documento_grezzo_id: documentoGrezzoId,
        categoria,
        fornitore: campi.fornitore,
        numero_fattura: campi.numero_fattura,
        data_emissione: campi.data_emissione,
        data_scadenza: campi.data_scadenza,
        periodo_da: campi.periodo_da,
        periodo_a: campi.periodo_a,
        importo: campi.importo,
        imponibile: campi.imponibile,
        iva: campi.iva,
        consumo: campi.consumo,
        unita_misura: campi.unita_misura,
        note: campi.note,
        raw_estrazione: anthropicBody,
      })
      .select()
      .single();
    if (insertErr) {
      await admin.from("documenti_grezzi").update({
        stato_elaborazione: "errore",
        errore_dettaglio: `Insert utenze_bollette fallito: ${insertErr.message}`,
      }).eq("id", documentoGrezzoId);
      return json(500, { error: `Insert utenze_bollette fallito: ${insertErr.message}` });
    }

    await admin.from("documenti_grezzi").update({
      stato_elaborazione: "elaborato",
      elaborato_at: new Date().toISOString(),
      errore_dettaglio: null,
    }).eq("id", documentoGrezzoId);

    return json(200, { bolletta });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

// estrai-busta-paga — Estrae i campi strutturati da un PDF di busta paga gia'
// archiviato in documenti_grezzi (sezione='introiti') e popola introiti_buste_paga.
//
// Stesso pattern di estrai-bolletta: non fa sync da Drive, il chiamante deve gia'
// aver caricato il PDF su Storage e creato la riga documenti_grezzo. intestatario_id
// e' passato dal chiamante (proprietà del dato, ortogonale a user_id), non inferito
// dal contenuto del PDF.
//
// JWT-protected, per utente. Richiede il secret ANTHROPIC_API_KEY su questo progetto
// Supabase (gia' configurato, condiviso con estrai-bolletta).
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { buildAnthropicRequest, parseAnthropicResponse } from "../_shared/estrazione-busta-paga.ts";

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
    const intestatarioId: string | undefined = body?.intestatario_id;
    if (!documentoGrezzoId) return json(400, { error: "Parametro 'documento_grezzo_id' mancante" });
    if (!intestatarioId) return json(400, { error: "Parametro 'intestatario_id' mancante" });

    const { data: documento, error: docErr } = await admin
      .from("documenti_grezzi")
      .select("id, storage_path, sezione")
      .eq("id", documentoGrezzoId)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr) return json(500, { error: `Lettura documento_grezzo fallita: ${docErr.message}` });
    if (!documento) return json(404, { error: "documento_grezzo non trovato per questo utente" });
    if (documento.sezione !== "introiti") {
      return json(400, { error: `documento_grezzo.sezione='${documento.sezione}', atteso 'introiti'` });
    }

    const { data: intestatario, error: intErr } = await admin
      .from("intestatari")
      .select("id")
      .eq("id", intestatarioId)
      .eq("user_id", userId)
      .maybeSingle();
    if (intErr) return json(500, { error: `Lettura intestatario fallita: ${intErr.message}` });
    if (!intestatario) return json(404, { error: "intestatario non trovato per questo utente" });

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
      body: JSON.stringify(buildAnthropicRequest(pdfBase64, MODEL)),
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

    const { data: bustaPaga, error: insertErr } = await admin
      .from("introiti_buste_paga")
      .insert({
        user_id: userId,
        intestatario_id: intestatarioId,
        documento_grezzo_id: documentoGrezzoId,
        datore_lavoro: campi.datore_lavoro,
        periodo_da: campi.periodo_da,
        periodo_a: campi.periodo_a,
        data_pagamento: campi.data_pagamento,
        lordo: campi.lordo,
        netto: campi.netto,
        irpef_trattenuta: campi.irpef_trattenuta,
        contributi_inps: campi.contributi_inps,
        addizionali_regionali_comunali: campi.addizionali_regionali_comunali,
        tfr_maturato: campi.tfr_maturato,
        altre_trattenute: campi.altre_trattenute,
        note: campi.note,
        raw_estrazione: anthropicBody,
      })
      .select()
      .single();
    if (insertErr) {
      await admin.from("documenti_grezzi").update({
        stato_elaborazione: "errore",
        errore_dettaglio: `Insert introiti_buste_paga fallito: ${insertErr.message}`,
      }).eq("id", documentoGrezzoId);
      return json(500, { error: `Insert introiti_buste_paga fallito: ${insertErr.message}` });
    }

    await admin.from("documenti_grezzi").update({
      stato_elaborazione: "elaborato",
      elaborato_at: new Date().toISOString(),
      errore_dettaglio: null,
    }).eq("id", documentoGrezzoId);

    return json(200, { bustaPaga });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

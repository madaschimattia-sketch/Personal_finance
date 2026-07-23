// calcola-fondo-pensione — Deduzione versamenti a previdenza complementare (quadro RP)
// per l'anno richiesto, aggregata su tutti i fondi_pensione dell'utente.
//
// Protetta da JWT utente. Stessa sicurezza anni gia' dichiarati di RT/RM/RW.
//
// NON copre (per design, vedi _shared/fondo-pensione.ts): l'imposta sostitutiva sul
// rendimento (gia' trattenuta dal fondo) e la tassazione in uscita (nessun riscatto
// reale e' ancora avvenuto).
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaDeduzioneVersamenti, type VersamentoInput } from "../_shared/fondo-pensione.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const body = await req.json().catch(() => ({}));
    const anno = Number(body?.anno);
    if (!Number.isInteger(anno)) return json(400, { error: "Parametro 'anno' mancante o non valido" });

    const { data: dich, error: dichErr } = await admin
      .from("dichiarazioni_fiscali")
      .select("stato")
      .eq("user_id", userId)
      .eq("anno", anno)
      .maybeSingle();
    if (dichErr) return json(500, { error: `Lettura dichiarazioni_fiscali fallita: ${dichErr.message}` });
    if (dich?.stato === "presentata") {
      return json(409, { error: `L'anno ${anno} risulta gia' presentato (dichiarazioni_fiscali): il quadro RP non viene ricalcolato/sovrascritto.` });
    }

    const { data: parametro, error: parErr } = await admin
      .from("config_fiscale_parametri")
      .select("valore")
      .eq("anno", anno)
      .eq("chiave", "tetto_deduzione_fondo_pensione_eur")
      .maybeSingle();
    if (parErr) return json(500, { error: `Lettura config_fiscale_parametri fallita: ${parErr.message}` });
    if (!parametro) return json(500, { error: `Tetto deduzione fondo pensione mancante in config_fiscale_parametri per l'anno ${anno}` });
    const tettoEur = Number(parametro.valore);

    const { data: fondi, error: fondiErr } = await admin.from("fondi_pensione").select("id").eq("user_id", userId);
    if (fondiErr) return json(500, { error: `Lettura fondi_pensione fallita: ${fondiErr.message}` });
    const fondoIds = (fondi ?? []).map((f) => f.id as string);

    if (fondoIds.length === 0) {
      return json(200, { anno, eventi: [], nota: "Nessun fondo pensione registrato" });
    }

    const { data: versamentiRows, error: versErr } = await admin
      .from("fondo_pensione_versamenti")
      .select("id, anno_competenza, importo_eur, deducibile")
      .in("fondo_id", fondoIds)
      .eq("anno_competenza", anno);
    if (versErr) return json(500, { error: `Lettura fondo_pensione_versamenti fallita: ${versErr.message}` });

    const versamenti: VersamentoInput[] = (versamentiRows ?? []).map((v) => ({
      id: v.id,
      annoCompetenza: v.anno_competenza as number,
      importoEur: Number(v.importo_eur),
      deducibile: v.deducibile as boolean,
    }));

    const risultato = calcolaDeduzioneVersamenti(versamenti, anno, tettoEur);

    const { error: delErr } = await admin
      .from("tax_events")
      .delete()
      .eq("user_id", userId)
      .eq("anno", anno)
      .eq("quadro", "RP");
    if (delErr) return json(500, { error: `Pulizia tax_events fallita: ${delErr.message}` });

    const eventi = [];
    if (risultato.versamentiDeducibiliLordi > 1e-9) {
      eventi.push({
        user_id: userId,
        conto_id: null,
        anno,
        quadro: "RP",
        tipo: "deduzione_versamenti_fondo_pensione",
        riferimento_id: null,
        imponibile_eur: risultato.importoDeducibile,
        aliquota_pct: null,
        imposta_eur: 0,
        note: `Versamenti deducibili lordi ${risultato.versamentiDeducibiliLordi.toFixed(2)} EUR, tetto ${tettoEur.toFixed(2)} EUR, `
          + `importo dedotto ${risultato.importoDeducibile.toFixed(2)} EUR`
          + (risultato.eccedenzaNonDeducibile > 1e-9
            ? `, eccedenza non deducibile ${risultato.eccedenzaNonDeducibile.toFixed(2)} EUR (esente da tassazione al riscatto, art. 11 D.Lgs 252/2005 — da tracciare).`
            : "."),
      });
    }

    if (eventi.length > 0) {
      const { error } = await admin.from("tax_events").insert(eventi);
      if (error) return json(500, { error: `Insert tax_events fallito: ${error.message}` });
    }

    return json(200, { anno, ...risultato });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

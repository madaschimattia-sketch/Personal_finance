// calcola-quadro-rt — Aggrega tax_lot_closures in eventi quadro RT (redditi diversi
// di natura finanziaria) per l'anno richiesto, gestendo le minusvalenze pregresse
// riportabili (tax_loss_carryforward).
//
// Protetta da JWT utente. A differenza di calcola-lotti-fiscali (per conto), qui
// l'aggregazione e' per UTENTE su tutti i suoi conti: la dichiarazione dei redditi
// e' unica, non per singolo broker.
//
// Sicurezza anni gia' dichiarati: rifiuta di calcolare/scrivere per un anno con
// dichiarazioni_fiscali.stato='presentata' — il quadro RT di un anno gia'
// presentato non va mai ricalcolato/sovrascritto da questa function (a differenza
// del 2025, esplicitamente "da preparare ora, da validare").
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaQuadroRT, type CarryforwardInput, type ClosureInput } from "../_shared/quadro-rt.ts";

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
      return json(409, { error: `L'anno ${anno} risulta gia' presentato (dichiarazioni_fiscali): il quadro RT non viene ricalcolato/sovrascritto.` });
    }

    const { data: parametri, error: parErr } = await admin
      .from("config_fiscale_parametri")
      .select("chiave, valore")
      .eq("anno", anno)
      .in("chiave", ["aliquota_capital_gain_ordinaria_pct", "aliquota_whitelist_titoli_stato_pct"]);
    if (parErr) return json(500, { error: `Lettura config_fiscale_parametri fallita: ${parErr.message}` });
    const paramByChiave = new Map((parametri ?? []).map((p) => [p.chiave as string, Number(p.valore)]));
    const ordinariaPct = paramByChiave.get("aliquota_capital_gain_ordinaria_pct");
    const whitelistPct = paramByChiave.get("aliquota_whitelist_titoli_stato_pct");
    if (ordinariaPct === undefined || whitelistPct === undefined) {
      return json(500, { error: `Aliquote mancanti in config_fiscale_parametri per l'anno ${anno}` });
    }

    const { data: closureRows, error: closErr } = await admin
      .from("tax_lot_closures")
      .select("id, categoria_compensazione, plus_minus_eur, data_chiusura")
      .eq("user_id", userId)
      .gte("data_chiusura", `${anno}-01-01`)
      .lte("data_chiusura", `${anno}-12-31`);
    if (closErr) return json(500, { error: `Lettura tax_lot_closures fallita: ${closErr.message}` });

    const chiusure: ClosureInput[] = (closureRows ?? []).map((c) => ({
      id: c.id,
      categoria_compensazione: c.categoria_compensazione,
      plus_minus_eur: Number(c.plus_minus_eur),
    }));

    const { data: cfRows, error: cfErr } = await admin
      .from("tax_loss_carryforward")
      .select("id, anno_origine, categoria, importo_residuo_eur")
      .eq("user_id", userId)
      .gte("anno_scadenza", anno)
      .gt("importo_residuo_eur", 0);
    if (cfErr) return json(500, { error: `Lettura tax_loss_carryforward fallita: ${cfErr.message}` });
    const carryforwardEsistenti: CarryforwardInput[] = (cfRows ?? []).map((c) => ({
      id: c.id,
      anno_origine: c.anno_origine,
      categoria: c.categoria,
      importo_residuo_eur: Number(c.importo_residuo_eur),
    }));

    const risultato = calcolaQuadroRT(chiusure, carryforwardEsistenti, {
      ordinaria_pct: ordinariaPct,
      whitelist_pct: whitelistPct,
    });

    const { error: delErr } = await admin
      .from("tax_events")
      .delete()
      .eq("user_id", userId)
      .eq("anno", anno)
      .eq("quadro", "RT");
    if (delErr) return json(500, { error: `Pulizia tax_events fallita: ${delErr.message}` });

    if (risultato.eventi.length > 0) {
      const { error } = await admin.from("tax_events").insert(
        risultato.eventi.map((e) => ({
          user_id: userId,
          conto_id: null,
          anno,
          quadro: e.quadro,
          tipo: e.tipo,
          riferimento_id: null,
          imponibile_eur: e.imponibile_eur,
          aliquota_pct: e.aliquota_pct,
          imposta_eur: e.imposta_eur,
          note: e.note,
        })),
      );
      if (error) return json(500, { error: `Insert tax_events fallito: ${error.message}` });
    }

    for (const c of risultato.carryforwardConsumati) {
      const { error } = await admin
        .from("tax_loss_carryforward")
        .update({ importo_residuo_eur: c.importo_residuo_eur })
        .eq("id", c.id);
      if (error) return json(500, { error: `Update tax_loss_carryforward fallito: ${error.message}` });
    }

    if (risultato.carryforwardNuovi.length > 0) {
      const { error } = await admin.from("tax_loss_carryforward").insert(
        risultato.carryforwardNuovi.map((c) => ({
          user_id: userId,
          anno_origine: anno,
          anno_scadenza: anno + 4,
          categoria: c.categoria,
          importo_originario_eur: c.importo_originario_eur,
          importo_residuo_eur: c.importo_residuo_eur,
        })),
      );
      if (error) return json(500, { error: `Insert tax_loss_carryforward fallito: ${error.message}` });
    }

    return json(200, {
      anno,
      eventi: risultato.eventi,
      carryforward_consumati: risultato.carryforwardConsumati.length,
      carryforward_nuovi: risultato.carryforwardNuovi.length,
      chiusure_non_classificate: risultato.chiusureNonClassificate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

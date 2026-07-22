// ibkr-flex-pull — Ingestione IBKR Flex Query per conto.
//
// Protetta da JWT utente (stesso pattern di chat-assistente in LMadvisory): non e' un
// endpoint pubblico, il service_role serve solo a bypassare RLS in scrittura, l'accesso
// resta ancorato all'utente autenticato (si processano solo i SUOI conti).
//
// Passi per ogni conto IBKR attivo con flex_query_id configurato:
//   1) pull XML (SendRequest -> GetStatement con retry)
//   2) archiviazione grezzo immutabile (Storage + documenti_grezzi)
//   3) normalizzazione: tax_instruments, movimenti, tax_movements, conto_nav_giornaliero
//
// NON fa parte di questa function (passo successivo, separato):
//   - matching lotti (LIFO/media ponderata) -> tax_lots/tax_lot_closures/tax_events
//   - normalizzazione di OpenPosition/InterestAccrualsCurrency/OptionEAE/CorporateActions
//     (contate ma non persistite — vedi ParsedFlexStatement.nonGestite)
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { pullFlexStatement, FlexQueryError } from "../_shared/ibkr-flex-client.ts";
import {
  parseFlexXml,
  mapTrade,
  mapCashTransaction,
  mapTransfer,
  mapSecurityInfo,
  mapNavRow,
  type MovimentoRow,
  type TaxMovementRow,
} from "../_shared/ibkr-flex-parse.ts";

interface Conto {
  id: string;
  user_id: string;
  ibkr_account_id: string | null;
  flex_query_id: string | null;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function processConto(admin: ReturnType<typeof createAdminClient>, conto: Conto, token: string) {
  if (!conto.flex_query_id) {
    return { conto_id: conto.id, status: "skipped", motivo: "flex_query_id non configurato" };
  }

  const { xml, referenceCode } = await pullFlexStatement(token, conto.flex_query_id);
  const parsed = parseFlexXml(xml);
  const hash = await sha256Hex(xml);
  const now = new Date();
  const year = now.getUTCFullYear();
  const storagePath = `${conto.user_id}/investimenti/ibkr/${conto.id}/${year}/flex_${referenceCode}_${now.getTime()}.xml`;

  const { error: uploadErr } = await admin.storage
    .from("documenti-grezzi")
    .upload(storagePath, xml, { contentType: "application/xml", upsert: false });
  if (uploadErr) throw new Error(`Upload storage fallito: ${uploadErr.message}`);

  const { data: docGrezzo, error: docErr } = await admin
    .from("documenti_grezzi")
    .insert({
      user_id: conto.user_id,
      sezione: "investimenti",
      origine: "ibkr_flex",
      origine_ref: referenceCode,
      conto_id: conto.id,
      storage_path: storagePath,
      nome_file: storagePath.split("/").pop(),
      hash_contenuto: hash,
      periodo_da: parsed.fromDate,
      periodo_a: parsed.toDate,
      stato_elaborazione: "in_attesa",
    })
    .select("id")
    .single();
  if (docErr) throw new Error(`Insert documenti_grezzi fallito: ${docErr.message}`);
  const documentoGrezzoId = docGrezzo.id as string;

  try {
    // 1) tax_instruments (upsert; non sovrascrive le classificazioni gia' confermate a mano)
    const instrumentRows = parsed.securities.map(mapSecurityInfo).filter((s) => s.isin);
    if (instrumentRows.length > 0) {
      const { error } = await admin
        .from("tax_instruments")
        .upsert(instrumentRows, { onConflict: "isin", ignoreDuplicates: false });
      if (error) throw new Error(`Upsert tax_instruments fallito: ${error.message}`);
    }

    const { data: instruments, error: instrErr } = await admin
      .from("tax_instruments")
      .select("id, isin")
      .not("isin", "is", null);
    if (instrErr) throw new Error(`Lettura tax_instruments fallita: ${instrErr.message}`);
    const instrumentIdByIsin = new Map<string, string>((instruments ?? []).map((r) => [r.isin as string, r.id as string]));

    // 2) movimenti (trade + cash + transfer) + subset fiscale
    const movimenti: MovimentoRow[] = [];
    const taxMovements: (TaxMovementRow & { movimento_transaction_id: string | null })[] = [];

    for (const t of parsed.trades) {
      const { movimento, taxMovement } = mapTrade(t, conto.id, conto.user_id);
      movimenti.push(movimento);
      taxMovements.push({ ...taxMovement, movimento_transaction_id: movimento.ibkr_transaction_id });
    }
    for (const c of parsed.cash) {
      const { movimento, taxMovement } = mapCashTransaction(c, conto.id, conto.user_id);
      movimenti.push(movimento);
      if (taxMovement) {
        taxMovements.push({ ...taxMovement, movimento_transaction_id: movimento.ibkr_transaction_id });
      }
    }
    for (const t of parsed.transfers) {
      movimenti.push(mapTransfer(t, conto.id, conto.user_id));
    }

    const movimentiConDoc = movimenti.map((m) => ({ ...m, documento_grezzo_id: documentoGrezzoId }));
    if (movimentiConDoc.length > 0) {
      const { error } = await admin
        .from("movimenti")
        .upsert(movimentiConDoc, { onConflict: "conto_id,ibkr_transaction_id", ignoreDuplicates: false });
      if (error) throw new Error(`Upsert movimenti fallito: ${error.message}`);
    }

    if (taxMovements.length > 0) {
      const { data: movRows, error: movErr } = await admin
        .from("movimenti")
        .select("id, ibkr_transaction_id")
        .eq("conto_id", conto.id)
        .not("ibkr_transaction_id", "is", null);
      if (movErr) throw new Error(`Lettura movimenti fallita: ${movErr.message}`);
      const movimentoIdByTxId = new Map<string, string>((movRows ?? []).map((r) => [r.ibkr_transaction_id as string, r.id as string]));

      const taxMovementRows = taxMovements.map(({ movimento_transaction_id, isin, ...rest }) => ({
        ...rest,
        movimento_id: movimento_transaction_id ? movimentoIdByTxId.get(movimento_transaction_id) ?? null : null,
        instrument_id: isin ? instrumentIdByIsin.get(isin) ?? null : null,
      }));
      const { error } = await admin
        .from("tax_movements")
        .upsert(taxMovementRows, { onConflict: "conto_id,ibkr_transaction_id", ignoreDuplicates: false });
      if (error) throw new Error(`Upsert tax_movements fallito: ${error.message}`);
    }

    // 3) NAV giornaliero
    const navRows = parsed.nav.map((n) => mapNavRow(n, conto.id, conto.user_id)).filter((n) => n.report_date);
    if (navRows.length > 0) {
      const { error } = await admin
        .from("conto_nav_giornaliero")
        .upsert(navRows, { onConflict: "conto_id,report_date", ignoreDuplicates: false });
      if (error) throw new Error(`Upsert conto_nav_giornaliero fallito: ${error.message}`);
    }

    await admin
      .from("documenti_grezzi")
      .update({ stato_elaborazione: "elaborato", elaborato_at: new Date().toISOString() })
      .eq("id", documentoGrezzoId);

    return {
      conto_id: conto.id,
      ibkr_account_id: parsed.accountId,
      status: "ok",
      documento_grezzo_id: documentoGrezzoId,
      counts: {
        trades: parsed.trades.length,
        cash: parsed.cash.length,
        transfers: parsed.transfers.length,
        instruments: instrumentRows.length,
        nav: navRows.length,
      },
      non_gestite: parsed.nonGestite,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("documenti_grezzi")
      .update({ stato_elaborazione: "errore", errore_dettaglio: message })
      .eq("id", documentoGrezzoId);
    throw e;
  }
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

    const token = Deno.env.get("IBKR_FLEX_TOKEN");
    if (!token) return json(500, { error: "IBKR_FLEX_TOKEN non configurato" });

    let contoIdFiltro: string | undefined;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      contoIdFiltro = body?.conto_id;
    }

    let query = admin
      .from("conti")
      .select("id, user_id, ibkr_account_id, flex_query_id")
      .eq("user_id", userId)
      .eq("broker", "IBKR")
      .eq("attivo", true)
      .not("flex_query_id", "is", null);
    if (contoIdFiltro) query = query.eq("id", contoIdFiltro);

    const { data: conti, error: contiErr } = await query;
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    if (!conti || conti.length === 0) {
      return json(200, { results: [], nota: "Nessun conto IBKR con flex_query_id configurato" });
    }

    const results = [];
    for (const conto of conti as Conto[]) {
      try {
        results.push(await processConto(admin, conto, token));
      } catch (e) {
        const message = e instanceof FlexQueryError
          ? `${e.message}${e.code ? ` (code ${e.code})` : ""}`
          : e instanceof Error
          ? e.message
          : String(e);
        results.push({ conto_id: conto.id, status: "error", errore: message });
      }
    }

    return json(200, { results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

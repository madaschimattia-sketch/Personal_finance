// calcola-quadro-rw — Calcola l'IVAFE (imposta, non il monitoraggio di dettaglio) per
// l'anno richiesto, per ciascun conto dell'utente.
//
// A differenza di RT/RM (aggregati per utente su tutti i conti, perche' la
// dichiarazione dei redditi e' unica), qui si lavora PER CONTO: ogni conto estero e'
// l'unita' naturale di monitoraggio IVAFE. Gli eventi tax_events risultanti hanno
// conto_id valorizzato.
//
// Protetta da JWT utente. Stessa sicurezza anni gia' dichiarati di RT/RM.
import { corsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { calcolaIvafe, giorniAnno, type GiacenzaMediaCashInput, type NavSnapshotInput } from "../_shared/quadro-rw.ts";

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
      return json(409, { error: `L'anno ${anno} risulta gia' presentato (dichiarazioni_fiscali): il quadro RW non viene ricalcolato/sovrascritto.` });
    }

    const { data: parametri, error: parErr } = await admin
      .from("config_fiscale_parametri")
      .select("chiave, valore")
      .eq("anno", anno)
      .in("chiave", ["ivafe_proporzionale_pct", "ivafe_cash_fissa_eur", "ivafe_cash_soglia_giacenza_media_eur"]);
    if (parErr) return json(500, { error: `Lettura config_fiscale_parametri fallita: ${parErr.message}` });
    const paramByChiave = new Map((parametri ?? []).map((p) => [p.chiave as string, Number(p.valore)]));
    const ivafeProporzionalePct = paramByChiave.get("ivafe_proporzionale_pct");
    const ivafeCashFissaEur = paramByChiave.get("ivafe_cash_fissa_eur");
    const ivafeCashSogliaGiacenzaMediaEur = paramByChiave.get("ivafe_cash_soglia_giacenza_media_eur");
    if (ivafeProporzionalePct === undefined || ivafeCashFissaEur === undefined || ivafeCashSogliaGiacenzaMediaEur === undefined) {
      return json(500, { error: `Parametri IVAFE mancanti in config_fiscale_parametri per l'anno ${anno}` });
    }
    const aliquote = { ivafeProporzionalePct, ivafeCashFissaEur, ivafeCashSogliaGiacenzaMediaEur };

    const { data: conti, error: contiErr } = await admin.from("conti").select("id").eq("user_id", userId);
    if (contiErr) return json(500, { error: `Lettura conti fallita: ${contiErr.message}` });
    if (!conti || conti.length === 0) return json(200, { anno, results: [] });

    const results = [];
    for (const conto of conti) {
      try {
        const { data: giacenzaRow, error: giacenzaErr } = await admin
          .from("v_giacenza_media_cash_annua")
          .select("giacenza_media_cash_eur")
          .eq("conto_id", conto.id)
          .eq("anno", anno)
          .maybeSingle();
        if (giacenzaErr) throw new Error(`Lettura v_giacenza_media_cash_annua fallita: ${giacenzaErr.message}`);
        const giacenza: GiacenzaMediaCashInput | null = giacenzaRow
          ? { giacenzaMediaCashEur: Number(giacenzaRow.giacenza_media_cash_eur) }
          : null;

        const { data: ultimoNavRow, error: ultimoErr } = await admin
          .from("conto_nav_giornaliero")
          .select("report_date, stock_eur, bonds_eur, options_eur, funds_eur, commodities_eur, crypto_eur")
          .eq("conto_id", conto.id)
          .gte("report_date", `${anno}-01-01`)
          .lte("report_date", `${anno}-12-31`)
          .order("report_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ultimoErr) throw new Error(`Lettura ultimo conto_nav_giornaliero fallita: ${ultimoErr.message}`);

        const { data: primoNavRow, error: primoErr } = await admin
          .from("conto_nav_giornaliero")
          .select("report_date")
          .eq("conto_id", conto.id)
          .order("report_date", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (primoErr) throw new Error(`Lettura primo conto_nav_giornaliero fallita: ${primoErr.message}`);

        let nav: NavSnapshotInput | null = null;
        let giorniPossesso = 0;
        const totaleGiorniAnno = giorniAnno(anno);

        if (ultimoNavRow) {
          const titoliEur = Number(ultimoNavRow.stock_eur) + Number(ultimoNavRow.bonds_eur) + Number(ultimoNavRow.options_eur)
            + Number(ultimoNavRow.funds_eur) + Number(ultimoNavRow.commodities_eur) + Number(ultimoNavRow.crypto_eur);
          nav = { reportDate: ultimoNavRow.report_date as string, titoliEur };

          const inizioAnno = new Date(`${anno}-01-01T00:00:00Z`);
          const primaData = primoNavRow ? new Date(`${primoNavRow.report_date}T00:00:00Z`) : inizioAnno;
          const inizioPeriodo = primaData > inizioAnno ? primaData : inizioAnno;
          const finePeriodo = new Date(`${ultimoNavRow.report_date}T00:00:00Z`);
          giorniPossesso = Math.round((finePeriodo.getTime() - inizioPeriodo.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        }

        const eventi = calcolaIvafe(nav, giacenza, { giorniPossesso, giorniAnno: totaleGiorniAnno }, aliquote);

        const { error: delErr } = await admin
          .from("tax_events")
          .delete()
          .eq("user_id", userId)
          .eq("conto_id", conto.id)
          .eq("anno", anno)
          .eq("quadro", "RW");
        if (delErr) throw new Error(`Pulizia tax_events fallita: ${delErr.message}`);

        if (eventi.length > 0) {
          const { error } = await admin.from("tax_events").insert(
            eventi.map((e) => ({
              user_id: userId,
              conto_id: conto.id,
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
          if (error) throw new Error(`Insert tax_events fallito: ${error.message}`);
        }

        results.push({ conto_id: conto.id, status: "ok", eventi });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ conto_id: conto.id, status: "error", errore: message });
      }
    }

    return json(200, { anno, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json(500, { error: message });
  }
});

// Client per l'IBKR Flex Web Service: pull asincrono a due passi (SendRequest -> GetStatement)
// con retry finche' il report non e' pronto. Vedi docs/ibkr-flex-query-spec.md per i dettagli.

const FLEX_BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

// Backoff dei retry su GetStatement quando il report e' ancora in generazione (ErrorCode 1019).
const RETRY_DELAYS_MS = [3000, 5000, 8000, 8000, 8000];

export class FlexQueryError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "FlexQueryError";
  }
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

async function sendRequest(token: string, queryId: string): Promise<string> {
  const url = `${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const res = await fetch(url);
  const text = await res.text();

  const status = extractTag(text, "Status");
  if (status !== "Success") {
    throw new FlexQueryError(
      extractTag(text, "ErrorMessage") ?? "SendRequest fallita",
      extractTag(text, "ErrorCode") ?? undefined,
    );
  }
  const referenceCode = extractTag(text, "ReferenceCode");
  if (!referenceCode) {
    throw new FlexQueryError("ReferenceCode assente nella risposta SendRequest");
  }
  return referenceCode;
}

async function getStatement(token: string, referenceCode: string): Promise<string> {
  const url = `${FLEX_BASE}/GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;
  const res = await fetch(url);
  return await res.text();
}

export interface FlexPullResult {
  xml: string;
  referenceCode: string;
}

export async function pullFlexStatement(token: string, queryId: string): Promise<FlexPullResult> {
  const referenceCode = await sendRequest(token, queryId);

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const text = await getStatement(token, referenceCode);

    // Wrapper di stato (non il report vero): "in generazione" o errore.
    if (text.includes("<FlexStatementResponse") && !text.includes("<FlexQueryResponse")) {
      const status = extractTag(text, "Status");
      const errorCode = extractTag(text, "ErrorCode");

      if (status === "Warn" && errorCode === "1019") {
        if (attempt === RETRY_DELAYS_MS.length) {
          throw new FlexQueryError("Statement non pronto dopo i retry disponibili", errorCode);
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }

      throw new FlexQueryError(
        extractTag(text, "ErrorMessage") ?? "GetStatement fallita",
        errorCode ?? undefined,
      );
    }

    return { xml: text, referenceCode };
  }

  throw new FlexQueryError("Statement non ricevuto");
}

// Estrazione campi strutturati da una bolletta/fattura (PDF) via Anthropic API.
// Puro/testabile: costruisce la richiesta e parsa la risposta, non tocca Storage/DB
// (quello vive nell'edge function estrai-bolletta, che orchestra fetch+chiamata+insert).
//
// Uso di tool_choice forzato (non parsing di testo libero): il modello e' costretto a
// restituire un oggetto conforme allo schema, eliminando l'ambiguita' di un JSON
// estratto da markdown/prosa libera.

export interface CampiBolletta {
  fornitore: string | null;
  numero_fattura: string | null;
  data_emissione: string; // YYYY-MM-DD
  data_scadenza: string | null;
  periodo_da: string | null;
  periodo_a: string | null;
  importo: number; // EUR, totale fattura
  imponibile: number | null;
  iva: number | null;
  consumo: number | null;
  unita_misura: string | null; // 'kWh' | 'Smc' | 'mc' | null
  note: string | null;
}

const TOOL_NAME = "registra_bolletta";

const TOOL_SCHEMA = {
  name: TOOL_NAME,
  description:
    "Registra i campi estratti da una bolletta o fattura di utenza domestica italiana.",
  input_schema: {
    type: "object",
    properties: {
      fornitore: { type: ["string", "null"], description: "Nome del fornitore/gestore (es. Enel Energia, A2A, TIM)" },
      numero_fattura: { type: ["string", "null"], description: "Numero identificativo della fattura/bolletta" },
      data_emissione: { type: "string", description: "Data di emissione del documento, formato YYYY-MM-DD" },
      data_scadenza: { type: ["string", "null"], description: "Data di scadenza del pagamento, formato YYYY-MM-DD, null se assente" },
      periodo_da: { type: ["string", "null"], description: "Inizio del periodo di competenza/consumo fatturato, formato YYYY-MM-DD, null se non applicabile (es. affitto/condominio senza periodo esplicito)" },
      periodo_a: { type: ["string", "null"], description: "Fine del periodo di competenza/consumo fatturato, formato YYYY-MM-DD, null se non applicabile" },
      importo: { type: "number", description: "Importo totale della fattura in EUR (IVA inclusa se presente)" },
      imponibile: { type: ["number", "null"], description: "Imponibile al netto IVA in EUR, null se non riportato separatamente" },
      iva: { type: ["number", "null"], description: "Importo IVA in EUR, null se non riportato separatamente" },
      consumo: { type: ["number", "null"], description: "Consumo fatturato nel periodo (kWh per luce, Smc per gas, mc per acqua), null se non applicabile (es. internet/condominio/affitto)" },
      unita_misura: { type: ["string", "null"], description: "Unita' di misura del consumo: 'kWh' | 'Smc' | 'mc', null se consumo e' null" },
      note: { type: ["string", "null"], description: "Eventuali osservazioni utili non catturate dagli altri campi (es. conguaglio, rateizzazione, anomalie evidenti)" },
    },
    required: ["data_emissione", "importo"],
  },
};

export function buildAnthropicRequest(pdfBase64: string, categoria: string, model: string) {
  return {
    model,
    max_tokens: 1024,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text:
              `Questa è una bolletta/fattura italiana di categoria "${categoria}". ` +
              "Estrai i campi richiesti dallo strumento registra_bolletta. Se un campo non è presente o non applicabile, usa null (mai inventare valori).",
          },
        ],
      },
    ],
  };
}

export function parseAnthropicResponse(body: unknown): CampiBolletta {
  const content = (body as { content?: unknown[] })?.content ?? [];
  const toolUse = content.find(
    (b): b is { type: "tool_use"; input: unknown } =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Nessun tool_use nella risposta Anthropic — estrazione fallita");
  }
  const input = toolUse.input as Record<string, unknown>;
  if (typeof input.data_emissione !== "string" || typeof input.importo !== "number") {
    throw new Error("Campi obbligatori (data_emissione, importo) mancanti nell'estrazione");
  }
  return {
    fornitore: (input.fornitore as string | null) ?? null,
    numero_fattura: (input.numero_fattura as string | null) ?? null,
    data_emissione: input.data_emissione,
    data_scadenza: (input.data_scadenza as string | null) ?? null,
    periodo_da: (input.periodo_da as string | null) ?? null,
    periodo_a: (input.periodo_a as string | null) ?? null,
    importo: input.importo,
    imponibile: (input.imponibile as number | null) ?? null,
    iva: (input.iva as number | null) ?? null,
    consumo: (input.consumo as number | null) ?? null,
    unita_misura: (input.unita_misura as string | null) ?? null,
    note: (input.note as string | null) ?? null,
  };
}

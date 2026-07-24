// Estrazione campi strutturati da una busta paga (PDF) via Anthropic API.
// Puro/testabile: costruisce la richiesta e parsa la risposta, non tocca Storage/DB
// (quello vive nell'edge function estrai-busta-paga, che orchestra fetch+chiamata+insert).
//
// Stesso pattern di estrazione-bolletta.ts: tool_choice forzato, non parsing di testo
// libero — il modello e' costretto a restituire un oggetto conforme allo schema.

export interface CampiBustaPaga {
  datore_lavoro: string;
  periodo_da: string; // YYYY-MM-DD
  periodo_a: string; // YYYY-MM-DD
  data_pagamento: string | null;
  lordo: number;
  netto: number;
  irpef_trattenuta: number | null;
  contributi_inps: number | null;
  addizionali_regionali_comunali: number | null;
  tfr_maturato: number | null;
  altre_trattenute: number | null;
  note: string | null;
}

const TOOL_NAME = "registra_busta_paga";

const TOOL_SCHEMA = {
  name: TOOL_NAME,
  description: "Registra i campi estratti da una busta paga italiana (lavoratore dipendente).",
  input_schema: {
    type: "object",
    properties: {
      datore_lavoro: { type: "string", description: "Nome del datore di lavoro/azienda" },
      periodo_da: { type: "string", description: "Inizio del periodo di competenza (mese di paga), formato YYYY-MM-DD (primo giorno del mese)" },
      periodo_a: { type: "string", description: "Fine del periodo di competenza, formato YYYY-MM-DD (ultimo giorno del mese)" },
      data_pagamento: { type: ["string", "null"], description: "Data di accredito/pagamento effettivo, formato YYYY-MM-DD, null se non indicata" },
      lordo: { type: "number", description: "Totale competenze lorde del periodo in EUR" },
      netto: { type: "number", description: "Netto in busta (importo effettivamente pagato) in EUR" },
      irpef_trattenuta: { type: ["number", "null"], description: "IRPEF trattenuta nel periodo in EUR, null se non riportata separatamente" },
      contributi_inps: { type: ["number", "null"], description: "Contributi previdenziali INPS a carico del lavoratore in EUR, null se non riportati separatamente" },
      addizionali_regionali_comunali: { type: ["number", "null"], description: "Addizionali IRPEF regionale+comunale trattenute in EUR, null se assenti/non riportate" },
      tfr_maturato: { type: ["number", "null"], description: "TFR maturato nel periodo in EUR, null se non riportato in busta" },
      altre_trattenute: { type: ["number", "null"], description: "Somma di altre trattenute non catturate dagli altri campi (es. welfare, prestiti, scioperi), null se nessuna" },
      note: { type: ["string", "null"], description: "Osservazioni utili non catturate dagli altri campi (es. arretrati, conguagli, mensilità aggiuntiva 13esima/14esima)" },
    },
    required: ["datore_lavoro", "periodo_da", "periodo_a", "lordo", "netto"],
  },
};

export function buildAnthropicRequest(pdfBase64: string, model: string) {
  return {
    model,
    max_tokens: 1024,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          {
            type: "text",
            text: "Questa è una busta paga italiana (lavoratore dipendente). Estrai i campi richiesti dallo strumento "
              + "registra_busta_paga. Se un campo non è presente o non applicabile, usa null (mai inventare valori).",
          },
        ],
      },
    ],
  };
}

export function parseAnthropicResponse(body: unknown): CampiBustaPaga {
  const content = (body as { content?: unknown[] })?.content ?? [];
  const toolUse = content.find(
    (b): b is { type: "tool_use"; input: unknown } =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Nessun tool_use nella risposta Anthropic — estrazione fallita");
  }
  const input = toolUse.input as Record<string, unknown>;
  if (
    typeof input.datore_lavoro !== "string" ||
    typeof input.periodo_da !== "string" ||
    typeof input.periodo_a !== "string" ||
    typeof input.lordo !== "number" ||
    typeof input.netto !== "number"
  ) {
    throw new Error("Campi obbligatori (datore_lavoro, periodo_da, periodo_a, lordo, netto) mancanti nell'estrazione");
  }
  return {
    datore_lavoro: input.datore_lavoro,
    periodo_da: input.periodo_da,
    periodo_a: input.periodo_a,
    data_pagamento: (input.data_pagamento as string | null) ?? null,
    lordo: input.lordo,
    netto: input.netto,
    irpef_trattenuta: (input.irpef_trattenuta as number | null) ?? null,
    contributi_inps: (input.contributi_inps as number | null) ?? null,
    addizionali_regionali_comunali: (input.addizionali_regionali_comunali as number | null) ?? null,
    tfr_maturato: (input.tfr_maturato as number | null) ?? null,
    altre_trattenute: (input.altre_trattenute as number | null) ?? null,
    note: (input.note as string | null) ?? null,
  };
}

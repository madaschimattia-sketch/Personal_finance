// Tassonomia unica di categoria (utenze_bollette + spese_fisse_manuali) e la loro
// mappa verso l'ambito di vita (Casa/Veicolo/Persona) che struttura la sezione
// "Spese ricorrenti". Prima di questo file la stessa CATEGORIA_LABEL era
// duplicata (e leggermente diversa) in Utenze.jsx/Budget.jsx/Dashboard.jsx —
// unica fonte di verità da qui in poi, sullo stesso pattern di
// ASSET_CLASS_LABEL/ASSET_CLASS_ORDER (Portafoglio.jsx/Dashboard.jsx).
export const CATEGORIA_LABEL = {
  // utenze_bollette — ambito Casa
  luce: "Luce",
  gas: "Gas",
  acqua: "Acqua",
  internet_telefono: "Internet/telefono",
  condominio: "Condominio",
  affitto: "Affitto",
  mutuo: "Mutuo",
  tari: "TARI",
  imu: "IMU",
  // spese_fisse_manuali — ambito Veicolo
  veicolo: "Veicolo (bollo/manutenzione)",
  assicurazione_auto: "Assicurazione auto",
  // spese_fisse_manuali — ambito Casa
  assicurazione_casa: "Assicurazione casa",
  // spese_fisse_manuali — ambito Persona
  streaming: "Streaming",
  software: "Software",
  fitness: "Fitness",
  assicurazione_persona: "Assicurazione persona",
  finanziamento_personale: "Finanziamento personale",
  bancario: "Bancario",
  altro: "Altro",
};

export const CATEGORIA_AMBITO = {
  luce: "casa",
  gas: "casa",
  acqua: "casa",
  internet_telefono: "casa",
  condominio: "casa",
  affitto: "casa",
  mutuo: "casa",
  tari: "casa",
  imu: "casa",
  assicurazione_casa: "casa",

  veicolo: "veicolo",
  assicurazione_auto: "veicolo",

  streaming: "persona",
  software: "persona",
  fitness: "persona",
  assicurazione_persona: "persona",
  finanziamento_personale: "persona",
  bancario: "persona",
  altro: "persona",
};

export const AMBITO_LABEL = { casa: "Casa", veicolo: "Veicolo", persona: "Persona" };
export const AMBITO_ORDER = ["casa", "veicolo", "persona"];

// Categorie di utenze_bollette per ambito Casa (bollette con periodo/consumo),
// distinte dalle categorie di spese_fisse_manuali (assicurazioni/finanziamenti,
// senza periodo/consumo) che possono comunque ricadere nello stesso ambito.
export const CATEGORIE_BOLLETTE_CASA = ["luce", "gas", "acqua", "internet_telefono", "condominio", "affitto", "mutuo", "tari", "imu"];
export const CATEGORIE_SPESE_CASA = ["assicurazione_casa"];
export const CATEGORIE_SPESE_VEICOLO = ["veicolo", "assicurazione_auto"];
export const CATEGORIE_SPESE_PERSONA = ["streaming", "software", "fitness", "assicurazione_persona", "finanziamento_personale", "bancario", "altro"];

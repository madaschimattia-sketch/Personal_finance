// Struttura di navigazione condivisa tra SectionLayout (tab desktop dentro una
// sezione) e Sidebar (albero desktop + bottom bar contestuale mobile) — unica
// fonte di verità per evitare che le due viste divergano.
import {
  HomeIcon, PortafoglioIcon, UtenzeIcon, BudgetIcon, ProiezioniIcon,
  FiscaleIcon, ChatIcon, CasaIcon, VeicoloIcon, PersonaIcon, FondoPensioneIcon,
} from "../components/Icons.jsx";

export const SEZIONE_INVESTIMENTI = {
  base: "/investimenti",
  label: "Investimenti",
  Icon: PortafoglioIcon,
  voci: [
    { to: "/investimenti/portafoglio", label: "Portafoglio", Icon: PortafoglioIcon },
    { to: "/investimenti/fondi-pensione", label: "Fondi Pensione", Icon: FondoPensioneIcon },
    { to: "/investimenti/fiscale", label: "Fiscalità", Icon: FiscaleIcon },
  ],
};

export const SEZIONE_SPESE_RICORRENTI = {
  base: "/spese-ricorrenti",
  label: "Spese ricorrenti",
  Icon: UtenzeIcon,
  voci: [
    { to: "/spese-ricorrenti/casa", label: "Casa", Icon: CasaIcon },
    { to: "/spese-ricorrenti/veicolo", label: "Veicolo", Icon: VeicoloIcon },
    { to: "/spese-ricorrenti/persona", label: "Persona", Icon: PersonaIcon },
  ],
};

// Voci top-level (fuori da una sezione nidificata): Home + le due sezioni + Budget/Proiezioni/Chat.
export const VOCI_TOP_LEVEL = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: SEZIONE_INVESTIMENTI.base, label: SEZIONE_INVESTIMENTI.label, Icon: SEZIONE_INVESTIMENTI.Icon },
  { to: SEZIONE_SPESE_RICORRENTI.base, label: SEZIONE_SPESE_RICORRENTI.label, Icon: SEZIONE_SPESE_RICORRENTI.Icon },
  { to: "/budget", label: "Budget", Icon: BudgetIcon },
  { to: "/proiezioni", label: "Proiezioni", Icon: ProiezioniIcon },
  { to: "/chat", label: "Chat", Icon: ChatIcon },
];

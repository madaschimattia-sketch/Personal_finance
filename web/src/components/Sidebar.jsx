import { NavLink, useLocation } from "react-router-dom";
import { VOCI_TOP_LEVEL, SEZIONE_INVESTIMENTI, SEZIONE_SPESE_RICORRENTI } from "../lib/nav.js";
import { HomeIcon, ChatIcon, BudgetIcon, ProiezioniIcon } from "./Icons.jsx";

const HOME_VOCE = { to: "/", label: "Home", Icon: HomeIcon, end: true };
const CHAT_VOCE = { to: "/chat", label: "Chat", Icon: ChatIcon };

// Bottom bar mobile contestuale: dentro una sezione mostra le sue sotto-pagine
// (Home + 3 voci + Chat = 5 icone) invece delle 6 voci top-level — altrimenti
// con 2 sezioni nidificate la barra piatta arriverebbe a 10+ pagine.
function vociMobile(pathname) {
  if (pathname.startsWith(SEZIONE_INVESTIMENTI.base)) return [HOME_VOCE, ...SEZIONE_INVESTIMENTI.voci, CHAT_VOCE];
  if (pathname.startsWith(SEZIONE_SPESE_RICORRENTI.base)) return [HOME_VOCE, ...SEZIONE_SPESE_RICORRENTI.voci, CHAT_VOCE];
  return VOCI_TOP_LEVEL;
}

function SezioneDesktop({ sezione }) {
  return (
    <li className="mt-2">
      <NavLink
        to={sezione.base}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-chip px-3 py-2.5 text-sm font-semibold transition-colors ${
            isActive ? "bg-hero text-white" : "text-muted hover:bg-black/5"
          }`
        }
      >
        <sezione.Icon className="h-[17px] w-[17px] shrink-0" />
        {sezione.label}
      </NavLink>
      <ul className="ml-6 mt-0.5 flex flex-col gap-0.5 border-l border-line pl-3">
        {sezione.voci.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `block rounded-chip px-3 py-1.5 text-sm font-semibold transition-colors ${isActive ? "text-ink" : "text-muted hover:text-ink"}`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function Sidebar({ email, onLogout }) {
  const location = useLocation();
  const vociBottomBar = vociMobile(location.pathname);

  const linkClassMobile = ({ isActive }) =>
    `flex flex-col items-center gap-1 rounded-chip px-2 py-1.5 text-[0.62rem] font-semibold transition-colors ${
      isActive ? "bg-hero text-white" : "text-muted hover:bg-black/5"
    }`;
  const linkClassDesktop = ({ isActive }) =>
    `flex items-center gap-3 rounded-chip px-3 py-2.5 text-sm font-semibold transition-colors ${
      isActive ? "bg-hero text-white" : "text-muted hover:bg-black/5"
    }`;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-line bg-surface px-2 py-1 lg:hidden">
        {vociBottomBar.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClassMobile}>
            <Icon className="h-[19px] w-[19px] shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <nav className="hidden lg:flex lg:w-[220px] lg:flex-col lg:gap-6 lg:border-r lg:border-line lg:px-4 lg:py-6">
        <div className="flex items-center gap-2 font-display text-[1.05rem] font-extrabold tracking-tight">
          <span className="h-[9px] w-[9px] rounded-full bg-accent" />
          Budgeting
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <NavLink to="/" end className={linkClassDesktop}>
              <HomeIcon className="h-[17px] w-[17px] shrink-0" />
              Home
            </NavLink>
          </li>
          <SezioneDesktop sezione={SEZIONE_INVESTIMENTI} />
          <SezioneDesktop sezione={SEZIONE_SPESE_RICORRENTI} />
          <li className="mt-2">
            <NavLink to="/budget" className={linkClassDesktop}>
              <BudgetIcon className="h-[17px] w-[17px] shrink-0" />
              Budget
            </NavLink>
          </li>
          <li>
            <NavLink to="/proiezioni" className={linkClassDesktop}>
              <ProiezioniIcon className="h-[17px] w-[17px] shrink-0" />
              Proiezioni
            </NavLink>
          </li>
          <li>
            <NavLink to="/chat" className={linkClassDesktop}>
              <ChatIcon className="h-[17px] w-[17px] shrink-0" />
              Chat
            </NavLink>
          </li>
        </ul>
        <div className="border-t border-line pt-3.5 text-[0.72rem] text-muted">
          {email}
          <button onClick={onLogout} className="mt-2 block font-semibold text-ink hover:text-accent">
            Esci
          </button>
        </div>
      </nav>
    </>
  );
}

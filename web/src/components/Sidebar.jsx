import { NavLink } from "react-router-dom";
import { HomeIcon, PortafoglioIcon, UtenzeIcon, BudgetIcon, ProiezioniIcon, FiscaleIcon, ChatIcon } from "./Icons.jsx";

const VOCI = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/portafoglio", label: "Portafoglio", Icon: PortafoglioIcon },
  { to: "/utenze", label: "Utenze", Icon: UtenzeIcon },
  { to: "/budget", label: "Budget", Icon: BudgetIcon },
  { to: "/proiezioni", label: "Proiezioni", Icon: ProiezioniIcon },
  { to: "/fiscale", label: "Fiscale", Icon: FiscaleIcon },
  { to: "/chat", label: "Chat", Icon: ChatIcon },
];

export default function Sidebar({ email, onLogout }) {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-chip px-3 py-2.5 text-sm font-semibold transition-colors ${
      isActive ? "bg-hero text-white" : "text-muted hover:bg-black/5"
    } flex-col gap-1 text-[0.62rem] px-2 py-1.5 lg:flex-row lg:gap-3 lg:text-sm lg:px-3 lg:py-2.5`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-line bg-surface px-2 py-1 lg:static lg:z-auto lg:flex-col lg:items-stretch lg:justify-start lg:gap-6 lg:border-t-0 lg:border-r lg:px-4 lg:py-6 lg:w-[220px]">
      <div className="hidden lg:flex items-center gap-2 font-display font-extrabold text-[1.05rem] tracking-tight">
        <span className="h-[9px] w-[9px] rounded-full bg-accent" />
        Budgeting
      </div>
      <ul className="flex flex-1 justify-around lg:flex-col lg:justify-start lg:gap-0.5">
        {VOCI.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end} className={linkClass}>
              <Icon className="h-[19px] w-[19px] shrink-0 lg:h-[17px] lg:w-[17px]" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block border-t border-line pt-3.5 text-[0.72rem] text-muted">
        {email}
        <button onClick={onLogout} className="mt-2 block font-semibold text-ink hover:text-accent">
          Esci
        </button>
      </div>
    </nav>
  );
}

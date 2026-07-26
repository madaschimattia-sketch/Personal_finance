import { NavLink, Outlet } from "react-router-dom";

export default function SectionLayout({ voci }) {
  return (
    <div>
      <nav className="mb-5 flex w-fit gap-1 rounded-chip border border-line bg-surface p-1">
        {voci.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `rounded-chip px-4 py-2 text-sm font-bold transition-colors ${
                isActive ? "bg-hero text-white" : "text-muted hover:text-ink"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

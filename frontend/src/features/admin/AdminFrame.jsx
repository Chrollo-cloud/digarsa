
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAdmin } from "./useAdmin";
import "../workspace/workspace.css";
import "../seller/seller-center.css";
import "./admin.css";

const nav = [
  ["/admin", "Overview", "grid", true],
  ["/admin/moderation", "Moderasi Services", "services"],
  ["/admin/orders", "Monitor Orders", "orders"],
  ["/admin/accounts", "Akun", "profile"],
  ["/admin/payments", "Payment Monitoring", "wallet"],
  ["/admin/payouts", "Payout Monitoring", "earnings"],
];

function NavigationIcon({ name }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    orders: "M7 5H4v16h16V5h-3 M8 3h8v5H8z M8 12h8 M8 16h5",
    services: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
    profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-3a8 5 0 0 1 16 0v3",
    wallet: "M4 6h16v14H4z M4 9h16 M16 14h1",
    earnings: "M3 5h18v14H3z M3 9h18 M16 14h2 M7 14h3",
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export default function AdminFrame({ title, description, children }) {
  const { error } = useAdmin();
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);

  useEffect(() => {
    document.title = `${title} — Digarsa Admin`;
  }, [title]);

  return (
    <div className="ws-page seller-center admin-center">
      <aside
        className="seller-sidebar"
        aria-label="Ruang kerja Admin"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <div className="seller-sidebar__heading">
          <div>
            <span className="ws-kicker">RUANG ADMINISTRATOR</span>
            <strong>
              Admin Center<span>.</span>
            </strong>
          </div>

          <button
            ref={toggle}
            className="seller-sidebar__toggle"
            type="button"
            aria-expanded={open}
            aria-controls="admin-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? "Tutup menu −" : "Menu admin +"}
          </button>
        </div>

        <nav
          id="admin-navigation"
          className={`seller-sidebar__nav${open ? " is-open" : ""}`}
          aria-label="Navigasi Admin Center"
        >
          <span className="seller-sidebar__label">ADMIN WORKSPACE</span>

          {nav.map(([to, label, icon, end]) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
            >
              <NavigationIcon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="seller-sidebar__identity">
          <span className="seller-sidebar__avatar" aria-hidden="true">
            A
          </span>
          <div>
            <strong>Administrator</strong>
            <span>Digarsa Platform</span>
          </div>
        </div>
      </aside>

      <div className="seller-center__content">
        <header className="ws-heading seller-heading">
          <span className="ws-kicker">DIGARSA / ADMIN CENTER</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>

        {error && (
          <p className="ws-alert" role="alert">
            {error}
          </p>
        )}

        {children}

        <p className="ws-demo">
          Admin Workspace · Pengelolaan dan pemantauan platform Digarsa.
        </p>
      </div>
    </div>
  );
}

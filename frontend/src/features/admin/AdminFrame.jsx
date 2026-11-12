
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAdmin } from "./useAdmin";
import "./admin.css";

const nav = [
  ["/admin", "Ringkasan", "overview", true],
  ["/admin/moderation", "Moderasi layanan", "moderation"],
  ["/admin/orders", "Monitor pesanan", "orders"],
  ["/admin/accounts", "Akun", "accounts"],
];

function AdminIcon({ name }) {
  const paths = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    moderation: "M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z M9 12l2 2 4-4",
    orders: "M7 5H4v16h16V5h-3 M8 3h8v5H8z M8 12h8 M8 16h5",
    accounts: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-3a8 5 0 0 1 16 0v3",
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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

  useEffect(() => {
    document.title = `${title} — Digarsa`;
  }, [title]);

  return (
    <div className="ws-page admin-center">
      <aside className="admin-sidebar" aria-label="Admin Center">
        <div className="admin-sidebar__heading">
          <div>
            <span className="ws-kicker">DIGARSA WORKSPACE</span>
            <strong>
              Admin Center<span>.</span>
            </strong>
          </div>

          <button
            className="admin-sidebar__toggle"
            type="button"
            aria-expanded={open}
            aria-controls="admin-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Tutup menu −" : "Menu admin +"}
          </button>
        </div>

        <nav
          id="admin-navigation"
          className={`admin-sidebar__nav${open ? " is-open" : ""}`}
          aria-label="Navigasi Admin Center"
        >
          <span className="admin-sidebar__label">ADMINISTRATION</span>

          {nav.map(([to, label, icon, end]) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
            >
              <AdminIcon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__badge">ADMIN</span>
          <span>Akses pengelolaan Digarsa</span>
        </div>
      </aside>

      <main className="admin-center__content">
        <header className="ws-heading admin-heading">
          <span className="ws-kicker">DIGARSA / ADMIN</span>
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
          Demo lokal · Data tersimpan di browser ini. Bukan otorisasi server,
          pembayaran, atau transaksi nyata.
        </p>
      </main>
    </div>
  );
}
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSeller } from "./useSeller";
import { handleSellerMenuEscape } from "./sellerNavigation";
import { useSellerNotifications } from "./useSellerNotifications";
import "../workspace/workspace.css";
import "./seller-center.css";

const icons = [
  "grid",
  "orders",
  "services",
  "messages",
  "notifications",
  "earnings",
  "wallet",
  "wallet",
  "wallet",
  "profile",
];
function NavigationIcon({ name }) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    orders: "M7 5H4v16h16V5h-3 M8 3h8v5H8z M8 12h8 M8 16h5",
    services: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
    messages: "M4 4h16v12H9l-5 4z M8 8h8 M8 12h5",
    notifications: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4",
    earnings: "M3 5h18v14H3z M3 9h18 M16 14h2 M7 14h3",
    wallet: "M4 6h16v14H4z M4 9h16 M16 14h1",
    profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-3a8 5 0 0 1 16 0v3",
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

export default function SellerFrame({ title, description, children }) {
  const { profile, bookings, error } = useSeller();
  const { unreadCount } = useSellerNotifications();
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  const waiting = bookings.filter((item) => item.status === "Requested").length;
  useEffect(() => {
    document.title = `${title} — Digarsa`;
  }, [title]);
  const nav = [
    ["/seller-dashboard", "Overview", 0, true],
    ["/seller-dashboard/orders", "Orders Log in", waiting],
    ["/seller-dashboard/services", "Service Saya"],
    ["/seller-dashboard/messages", "Pesan"],
    ["/seller-dashboard/notifications", "Notifikasi", unreadCount],
    ["/seller-dashboard/earnings", "Earnings"],
    ["/seller-dashboard/wallet", "Wallet"],
    ["/seller-dashboard/withdraw", "Withdraw"],
    ["/seller-dashboard/payout-history", "Riwayat Pencairan"],
    ["/seller-dashboard/profile", "Seller profile"],
  ];
  return (
    <div className="ws-page seller-center">
      <aside
        className="seller-sidebar"
        aria-label="Ruang kerja kreator"
        onKeyDown={(event) =>
          handleSellerMenuEscape(event, open, () => setOpen(false), toggle.current)
        }
      >
        <div className="seller-sidebar__heading">
          <div>
            <span className="ws-kicker">RUANG KREATOR</span>
            <strong>
              Seller Center<span>.</span>
            </strong>
          </div>
          <button
            ref={toggle}
            className="seller-sidebar__toggle"
            type="button"
            aria-expanded={open}
            aria-controls="seller-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? "Tutup menu −" : "Menu seller +"}
          </button>
        </div>
        <nav
          id="seller-navigation"
          className={`seller-sidebar__nav${open ? " is-open" : ""}`}
          aria-label="Navigasi Seller Center"
        >
          <span className="seller-sidebar__label">WORKSPACE</span>
          {nav.map(([to, label, count, end], index) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}>
              <NavigationIcon name={icons[index]} />
              <span>{label}</span>
              {count > 0 && (
                <small aria-label={`${count} ${label.toLowerCase()}`}>
                  {count}
                </small>
              )}
            </NavLink>
          ))}
        </nav>
        {profile && (
          <div className="seller-sidebar__identity">
            <span className="seller-sidebar__avatar" aria-hidden="true">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{profile.name}</strong>
              <Link to={`/seller/${profile.id}`}>View profile publik </Link>
            </div>
          </div>
        )}
      </aside>
      <div className="seller-center__content">
        <header className="ws-heading seller-heading">
          <span className="ws-kicker">DIGARSA / SELLER CENTER</span>
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
      </div>
    </div>
  );
}

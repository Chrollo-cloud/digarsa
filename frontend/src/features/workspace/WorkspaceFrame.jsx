import { bookingStatusLabel } from "../customer/bookingLifecycle";
import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import "./workspace.css";

export function StatusBadge({ status, children }) {
  return (
    <span className={`ws-status is-${String(status).toLowerCase()}`}>
      {children || bookingStatusLabel(status)}
    </span>
  );
}

export default function WorkspaceFrame({
  kicker,
  title,
  description,
  nav,
  error,
  children,
}) {
  useEffect(() => {
    document.title = `${title} — Digarsa`;
  }, [title]);
  return (
    <div className="ws-page">
      <div className="ws-shell">
        <header className="ws-heading">
          <span className="ws-kicker">{kicker}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        <nav className="ws-nav" aria-label={`Navigasi ${kicker}`}>
          {nav.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>
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

export function Stat({ label, value, note, to }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </>
  );
  return to ? (
    <NavLink className="ws-stat" to={to}>
      {body}
    </NavLink>
  ) : (
    <div className="ws-stat">{body}</div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="ws-empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

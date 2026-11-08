import { useEffect, useLayoutEffect } from "react";
import { NavLink } from "react-router-dom";
import "./messaging.css";

export default function MessagingFrame({ title, children, thread = false }) {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    document.title = `${title} — Digarsa`;
  }, [title]);
  return (
    <div className="customer-messaging">
      <div className="messaging-shell">
        {!thread && (
          <header className="messaging-heading">
            <span className="messaging-kicker">
              DIGARSA / RUANG PERSONAL · DEMO
            </span>
            <h1>
              {title}
              <span>.</span>
            </h1>
            <p>Percakapan dan kabar kolaborasimu, dalam satu ruang.</p>
          </header>
        )}
        <nav className="messaging-nav" aria-label="Navigasi pesan pelanggan">
          <NavLink to="/dashboard">← Dashboard</NavLink>
          <NavLink to="/messages">Pesan</NavLink>
          <NavLink to="/notifications">Notifikasi</NavLink>
        </nav>
        {children}
        <p className="messaging-demo">
          Demo lokal · Data di browser ini, bukan sinkronisasi lintas perangkat
          atau otorisasi server.
        </p>
      </div>
    </div>
  );
}

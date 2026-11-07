import { useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../account/authContext";
import "./profile.css";

export default function ProfileLayout({ settings = false, children }) {
  const { storageError } = useAuth();
  useEffect(() => {
    document.title = `${settings ? "Pengaturan akun" : "Profil Saya"} — Digarsa`;
  }, [settings]);
  return (
    <div className="personal-page">
      <div className="personal-shell">
        <Link className="personal-back" to="/dashboard">
          ← Kembali ke dashboard
        </Link>
        <header className="personal-heading">
          <span className="market-kicker">
            AKUN DIGARSA / {settings ? "PENGATURAN" : "PROFIL"}
          </span>
          <h1>
            {settings ? (
              <>
                Pengaturan <em>akun.</em>
              </>
            ) : (
              <>
                Informasi <em>pribadi.</em>
              </>
            )}
          </h1>
          <p>
            Kelola informasi akunmu untuk membantu setiap kolaborasi berjalan
            lebih dekat.
          </p>
        </header>
        <nav className="personal-navigation" aria-label="Navigasi profil">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/profile">Profil Saya</NavLink>
          <NavLink to="/favorites">Favorit</NavLink>
          <NavLink to="/orders">Pesanan</NavLink>
          <NavLink to="/settings">Pengaturan</NavLink>
        </nav>
        {storageError && (
          <p className="personal-feedback is-error" role="alert">
            {storageError}
          </p>
        )}
        {children}
        <p className="personal-footnote">
          Demo lokal — informasi dan kredensial disimpan di browser ini. Ini
          bukan autentikasi atau otorisasi server. Gunakan data dan kata sandi
          khusus demo.
        </p>
      </div>
    </div>
  );
}

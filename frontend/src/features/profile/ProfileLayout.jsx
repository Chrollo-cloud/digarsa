import { useEffect } from "react";
import { useAuth } from "../account/authContext";
import "./profile.css";

export default function ProfileLayout({ settings = false, children }) {
  const { storageError } = useAuth();
  useEffect(() => {
    document.title = `${settings ? "Settings akun" : "My Profile"} — Digarsa`;
  }, [settings]);
  return (
    <div className="personal-page">
      <div className="personal-shell">
        <header className="personal-heading">
          <span className="market-kicker">
            AKUN DIGARSA / {settings ? "PENGATURAN" : "PROFIL"}
          </span>
          <h1>
            {settings ? (
              <>
                Settings <em>akun.</em>
              </>
            ) : (
              <>
                Informasi <em>pribadi.</em>
              </>
            )}
          </h1>
          <p>{settings ? "Kelola akses akun Digarsa dan pahami pengaturan privasimu." : "Identitas yang membantu ide baik bertemu kolaborasi yang tepat."}</p>
        </header>
        {storageError && (
          <p className="personal-feedback is-error" role="alert">
            {storageError}
          </p>
        )}
        {children}
        <p className="personal-footnote">Informasi profil akun disimpan di server Digarsa. Buku alamat dan sebagian fitur akun masih menggunakan data demo lokal dan belum disinkronkan.</p>
      </div>
    </div>
  );
}

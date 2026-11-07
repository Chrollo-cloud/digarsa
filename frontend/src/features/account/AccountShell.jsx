import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./authContext";
import DemoNotice from "./DemoNotice";
import "./account.css";

export default function AccountShell({ title = "Dashboard", seller = false }) {
  const { user, store } = useAuth();
  const profile = seller ? store.getOwnedSeller(user.sellerProfileId) : null;
  useEffect(() => {
    document.title = `${title} — Digarsa`;
  }, [title]);
  return (
    <section className="container route-shell account-shell">
      <span className="account-kicker">
        DIGARSA / {seller ? "SELLER CENTER" : "AKUN"}
      </span>
      <h1 className="type-display">{title}.</h1>
      <p>Halo, {user.name}. Halaman ini sedang dalam pengembangan.</p>
      {profile && (
        <div className="account-feedback">
          <strong>Seller Profile aktif: {profile.name}</strong>
          <p>
            {profile.category} · {profile.city}
          </p>
          <p>
            Profil ini milik akunmu. Fitur pengelolaan layanan belum tersedia.
          </p>
        </div>
      )}
      <p>
        Akunmu tetap dapat menggunakan marketplace sebagai pembeli. Booking,
        checkout, dan pesan belum tersedia.
      </p>
      <Link to="/marketplace">Jelajahi marketplace →</Link>
      <DemoNotice />
    </section>
  );
}

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
      <p>Halo, {user.name}. This page is under development.</p>
      {profile && (
        <div className="account-feedback">
          <strong>Seller Profile aktif: {profile.name}</strong>
          <p>
            {profile.category} · {profile.city}
          </p>
          <p>
            This profile belongs to your account. Service management is not available.
          </p>
        </div>
      )}
      <p>
        You can still use the marketplace as a customer. Bookings, checkout, and messaging are not available.
      </p>
      <Link to="/marketplace">Explore the marketplace</Link>
      <DemoNotice />
    </section>
  );
}

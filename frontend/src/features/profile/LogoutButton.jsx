import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../account/authContext";

export default function LogoutButton() {
  const { store } = useAuth();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  function logout() {
    try {
      store.logout();
      navigate("/login", { replace: true });
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <section className="personal-card personal-session">
      <div>
        <span className="market-kicker">SESI AKUN</span>
        <h2>Completed untuk sekarang?</h2>
        <p>
          Log out menghapus sesi dari browser ini. Sesi server dapat tetap aktif
          sampai token kedaluwarsa.
        </p>
      </div>
      <button
        className="button button--secondary"
        type="button"
        onClick={logout}
      >
        Log out
      </button>
      {error && (
        <p className="personal-feedback is-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

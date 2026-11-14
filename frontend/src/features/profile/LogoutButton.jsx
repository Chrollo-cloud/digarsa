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
          Log out menghapus sesi browser ini dan meminta server mengeluarkan
          semua sesi akun. Jika server tidak dapat dijangkau, sesi browser tetap
          dihapus; sesi server dapat berlaku sampai token kedaluwarsa.
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

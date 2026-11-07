import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCustomer } from "./useCustomer";
import "./customer.css";

export default function ServiceActions({ service }) {
  const { user, favorites, cart, store } = useCustomer();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const saved = favorites.includes(service.id);
  const added = cart.includes(service.id);
  function act(kind) {
    if (!user) {
      navigate(
        `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
      );
      return;
    }
    try {
      if (kind === "favorite") {
        if (saved) store.removeFavorite(service.id);
        else store.addFavorite(service.id);
        setMessage(saved ? "Favorit dihapus." : "Layanan disimpan.");
      } else {
        if (added) store.removeFromCart(service.id);
        else store.addToCart(service.id);
        setMessage(
          added ? "Dihapus dari pertimbangan." : "Ditambahkan ke pertimbangan.",
        );
      }
      setError(false);
    } catch (failure) {
      setMessage(failure.message);
      setError(true);
    }
  }
  return (
    <div className="customer-service-actions">
      <div>
        <button
          type="button"
          aria-label={`${saved ? "Hapus dari" : "Simpan ke"} favorit: ${service.title}`}
          aria-pressed={saved}
          onClick={() => act("favorite")}
        >
          {saved ? "♥ Disimpan" : "♡ Simpan"}
        </button>
        <button
          type="button"
          aria-label={`${added ? "Hapus dari" : "Tambah ke"} pertimbangan: ${service.title}`}
          aria-pressed={added}
          onClick={() => act("cart")}
        >
          {added ? "✓ Dipertimbangkan" : "+ Pertimbangkan"}
        </button>
      </div>
      <span role={error ? "alert" : "status"}>{message}</span>
    </div>
  );
}

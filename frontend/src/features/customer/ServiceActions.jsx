import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCustomer } from "./useCustomer";
import "./customer.css";

export default function ServiceActions({ service }) {
  const { user, favorites, cart, savedItems, savedActions } = useCustomer();
  const [feedback, setFeedback] = useState({ owner: null, serviceId: "", text: "", error: false });
  const location = useLocation();
  const navigate = useNavigate();
  const saved = favorites.includes(service.id);
  const added = cart.includes(service.id);
  const feedbackOwner = user?.id || null;
  const feedbackMatches = feedback.owner === feedbackOwner && feedback.serviceId === service.id;
  const message = feedbackMatches ? feedback.text : "";
  const error = feedbackMatches && feedback.error;
  const showFeedback = (text, isError = false) => setFeedback({ owner: feedbackOwner, serviceId: service.id, text, error: isError });
  async function act(kind) {
    if (!user) {
      navigate(
        `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
      );
      return;
    }
    const collection = kind === "favorite" ? savedItems.favorites : savedItems.cart;
    const pendingKey = `${kind === "favorite" ? "favorites" : "cart"}:${service.id}`;
    if (collection.status !== "ready" || savedItems.pending[pendingKey]) return;
    if (kind === "cart" && !added && service.bookable !== true) {
      showFeedback("This service is not currently available to add to cart.", true);
      return;
    }
    try {
      if (kind === "favorite") {
        if (saved) await savedActions.removeFavorite(service.id);
        else await savedActions.addFavorite(service.id, service);
        showFeedback(saved ? "Removed from favorites." : "Saved to favorites.");
      } else {
        if (added) await savedActions.removeFromCart(service.id);
        else await savedActions.addToCart(service.id, service);
        showFeedback(added ? "Removed from cart." : "Added to cart.");
      }
    } catch (failure) {
      showFeedback(failure.message, true);
    }
  }
  const favoritePending = Boolean(savedItems.pending[`favorites:${service.id}`]);
  const cartPending = Boolean(savedItems.pending[`cart:${service.id}`]);
  const favoritesReady = savedItems.favorites.status === "ready";
  const cartReady = savedItems.cart.status === "ready";
  const savedLoadError = savedItems.favorites.error || savedItems.cart.error;
  return (
    <div className="customer-service-actions">
      <div>
        <button
          type="button"
          aria-label={`${saved ? "Hapus dari" : "Save ke"} favorit: ${service.title}`}
          aria-pressed={saved}
          disabled={Boolean(user && (!favoritesReady || favoritePending))}
          onClick={() => void act("favorite")}
        >
          {favoritePending ? "Saving…" : saved ? "♥ Disimpan" : "♡ Save"}
        </button>
        <button
          type="button"
          aria-label={`${added ? "Hapus dari" : "Tambah ke"} keranjang: ${service.title}`}
          aria-pressed={added}
          disabled={Boolean(user && (!cartReady || cartPending)) || (!added && service.bookable !== true)}
          onClick={() => void act("cart")}
        >
          {cartPending ? "Updating…" : added ? "✓ Di keranjang" : "+ Cart"}
        </button>
      </div>
      <span role={error || savedLoadError ? "alert" : "status"}>{message || savedLoadError?.message || (!service.bookable && !added ? "Currently unavailable for cart." : "")}</span>
      {user && savedLoadError && <button className="location-link" type="button" onClick={() => void savedActions.refresh()}>Retry saved items</button>}
    </div>
  );
}

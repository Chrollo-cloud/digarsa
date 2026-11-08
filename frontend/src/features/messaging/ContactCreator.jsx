import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMessaging } from "./useMessaging";
import { customerMessaging } from "./customerMessagingClient";
import "./messaging.css";

export default function ContactCreator({
  sellerProfileId,
  serviceId,
  bookingId,
}) {
  const {
    user,
    data: reason,
    error,
  } = useMessaging(() =>
    customerMessaging.contactAvailability(sellerProfileId),
  );
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Guest availability still checks the actual persisted profile, not a mock owner.
  let unavailable = reason || error;
  if (!user) {
    try {
      unavailable = customerMessaging.contactAvailability(sellerProfileId);
    } catch {
      unavailable =
        "Penyimpanan demo tidak dapat dibaca. Coba lagi setelah penyimpanan tersedia.";
    }
  }
  function start() {
    if (!user) {
      navigate(
        `/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`,
      );
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const conversation = bookingId
        ? customerMessaging.startBooking(bookingId)
        : customerMessaging.startService(serviceId);
      navigate(`/messages/${conversation.id}`);
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="messaging-contact">
      <button
        className="button button--secondary"
        type="button"
        disabled={!!unavailable || busy}
        onClick={start}
      >
        {busy ? "Membuka…" : bookingId ? "Hubungi kreator ↗" : "Chat Kreator ↗"}
      </button>
      {unavailable && <p className="messaging-contact-note">{unavailable}</p>}
      {failure && (
        <p role="alert" className="messaging-error">
          {failure}
        </p>
      )}
    </div>
  );
}

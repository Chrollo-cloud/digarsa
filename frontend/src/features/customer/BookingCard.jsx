import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { bookingDate } from "./formatters";
export default function BookingCard({ booking }) {
  return (
    <article className="customer-booking-card">
      <header>
        <span
          className={`customer-status status-${booking.status.toLowerCase()}`}
        >
          {booking.status}
        </span>
        <small>{new Date(booking.createdAt).toLocaleDateString("id-ID")}</small>
      </header>
      <h3>
        <Link to={`/orders/${booking.id}`}>{booking.serviceTitle}</Link>
      </h3>
      <p>
        {booking.creatorName} ·{" "}
        {booking.deliveryMode === "onsite" ? "Onsite" : "Remote"}
      </p>
      <p>{bookingDate(booking.requestedDate)}</p>
      <footer>
        <strong>{money(booking.estimatedPrice)}</strong>
        <Link to={`/orders/${booking.id}`}>Lihat detail →</Link>
      </footer>
    </article>
  );
}

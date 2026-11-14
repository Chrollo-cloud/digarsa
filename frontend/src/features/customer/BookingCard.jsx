import { Link } from "react-router-dom";
import { money } from "../../utils/money.js";
import { bookingDate } from "./formatters";
import { bookingStatusLabel } from "./bookingLifecycle";

export default function BookingCard({ booking }) {
  return (
    <article className="customer-booking-card">
      <header>
        <span className={`customer-status status-${String(booking.status).toLowerCase()}`}>{bookingStatusLabel(booking.status)}</span>
        <small>{booking.createdAt ? new Date(booking.createdAt).toLocaleDateString("en-US") : "Date unavailable"}</small>
      </header>
      <h3><Link to={`/orders/${encodeURIComponent(booking.id)}`}>{booking.serviceTitle}</Link></h3>
      <p>{booking.creatorName} · {booking.deliveryMode === "onsite" ? "On-site" : booking.deliveryMode === "remote" ? "Remote" : "Work mode unavailable"}</p>
      <p>{bookingDate(booking.requestedDate)}</p>
      {booking.status === "Declined" && booking.declineReason && <p className="customer-order-decline"><strong>Decline reason:</strong> {booking.declineReason}</p>}
      <footer>
        <strong><small>Server estimate</small>{booking.estimatedPrice === null ? "Unavailable" : money(booking.estimatedPrice)}</strong>
        <Link to={`/orders/${encodeURIComponent(booking.id)}`}>View details</Link>
      </footer>
    </article>
  );
}

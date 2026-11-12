import { bookingStatusLabel } from "./bookingLifecycle";
import { Link } from "react-router-dom";
import { useAuth } from "../account/authContext";
import { money } from "../../data/marketplace";
import { bookingDate, customerDeclineReason } from "./formatters";
export default function BookingCard({ booking }) {
  const { user } = useAuth();
  const declineReason = customerDeclineReason(booking, user?.id);
  return (
    <article className="customer-booking-card">
      <header>
        <span
          className={`customer-status status-${booking.status.toLowerCase()}`}
        >
          {bookingStatusLabel(booking.status)}
        </span>
        <small>{new Date(booking.createdAt).toLocaleDateString("en-US")}</small>
      </header>
      <h3>
        <Link to={`/orders/${booking.id}`}>{booking.serviceTitle}</Link>
      </h3>
      <p>
        {booking.creatorName} ·{" "}
        {booking.deliveryMode === "onsite" ? "On-site" : "Remote"}
      </p>
      <p>{bookingDate(booking.requestedDate)}</p>
        {declineReason && <p className="customer-order-decline"><strong>Decline reason:</strong> {declineReason}</p>}
      <footer>
        <strong><small>{Number.isSafeInteger(booking.finalPrice) ? "Seller's final price" : "Starting estimate"}</small>{money(booking.finalPrice ?? booking.estimatedPrice)}</strong>
        <Link to={`/orders/${booking.id}`}>View details</Link>
        {booking.status === "Accepted" && Number.isSafeInteger(booking.finalPrice) && <Link to={`/payment/${booking.id}`}>Demo payment</Link>}
      </footer>
    </article>
  );
}

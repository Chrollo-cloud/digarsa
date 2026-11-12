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
        <small>{new Date(booking.createdAt).toLocaleDateString("id-ID")}</small>
      </header>
      <h3>
        <Link to={`/orders/${booking.id}`}>{booking.serviceTitle}</Link>
      </h3>
      <p>
        {booking.creatorName} ·{" "}
        {booking.deliveryMode === "onsite" ? "Di lokasi" : "Daring"}
      </p>
      <p>{bookingDate(booking.requestedDate)}</p>
      {declineReason && <p className="customer-order-decline"><strong>Alasan ditolak:</strong> {declineReason}</p>}
      <footer>
        <strong><small>{Number.isSafeInteger(booking.finalPrice) ? "Harga akhir Seller" : "Estimasi mulai dari"}</small>{money(booking.finalPrice ?? booking.estimatedPrice)}</strong>
        <Link to={`/orders/${booking.id}`}>Lihat detail →</Link>
        {booking.status === "Accepted" && Number.isSafeInteger(booking.finalPrice) && <Link to={`/payment/${booking.id}`}>Pembayaran demo →</Link>}
      </footer>
      <small className="customer-payment-status">Pembayaran: {booking.paymentStatus || (booking.status === "Paid" || booking.status === "Completed" ? "Paid" : "Unpaid")}</small>
    </article>
  );
}

import { useSearchParams } from "react-router-dom";
import { useAuth } from "../account/authContext.js";
import { useBookingList } from "../bookings/useBookingList.js";
import { bookingStatusLabel } from "./bookingLifecycle";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingCard from "./BookingCard";

const statuses = ["Requested", "Accepted", "Paid", "Delivered", "Completed", "Declined", "Cancelled"];

export default function OrdersPage() {
  const { user, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get("status") || "";
  const status = statuses.includes(requested) ? requested : "";
  const bookings = useBookingList("customer", status, user?.id, logout);
  function setStatus(value) { setParams(value ? { status: value } : {}, { replace: true }); }
  return (
    <CustomerFrame serverBacked title="Every idea has its own journey." description="Track the status saved by the Digarsa server.">
      <div className="customer-order-tabs" role="group" aria-label="Order status">
        {[ ["", "All"], ...statuses.map((value) => [value, bookingStatusLabel(value)]) ].map(([value, label]) => (
          <button key={label} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>
      {bookings.status === "loading" && <p role="status" className="customer-empty">Loading your bookings…</p>}
      {bookings.error && <div className="customer-warning" role="alert"><p>{bookings.error}</p><button type="button" className="market-reset" onClick={bookings.refresh}>Try again</button></div>}
      {bookings.status === "ready" && bookings.items.length > 0 && <>
        <p className="customer-list-caption">Showing {bookings.items.length} of {bookings.total} server bookings.</p>
        <div className="customer-order-grid">{bookings.items.map((booking) => <BookingCard key={booking.id} booking={booking} />)}</div>
      </>}
      {bookings.status === "ready" && !bookings.items.length && <EmptyState title={status ? `No ${bookingStatusLabel(status).toLowerCase()} bookings.` : "No booking requests yet."}>After you submit a project brief, the server record appears here.</EmptyState>}
      {bookings.hasMore && <div className="market-load-more"><button className="button button--secondary" type="button" disabled={bookings.loadingMore} onClick={() => void bookings.loadMore()}>{bookings.loadingMore ? "Loading…" : "Load more"}</button></div>}
      {bookings.status === "ready" && bookings.error && <p role="alert" className="customer-warning">{bookings.error}</p>}
    </CustomerFrame>
  );
}

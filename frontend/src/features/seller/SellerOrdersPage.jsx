import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../account/authContext.js";
import { useBookingList } from "../bookings/useBookingList.js";
import { bookingStatusLabel } from "../customer/bookingLifecycle";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";

const statuses = ["Requested", "Accepted", "Paid", "Delivered", "Completed", "Declined", "Cancelled"];

export default function SellerOrdersPage() {
  const { user, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const candidate = params.get("status") || "";
  const status = statuses.includes(candidate) ? candidate : "";
  const bookings = useBookingList("seller", status, user?.id, logout);
  return (
    <SellerFrame serverBacked title="Incoming bookings." description="These booking records come from the Digarsa server.">
      <div className="ws-toolbar">
        <div className="field"><label htmlFor="order-status">Filter by status</label>
          <select id="order-status" className="field__control" value={status} onChange={(event) => setParams(event.target.value ? { status: event.target.value } : {})}>
            <option value="">All status</option>{statuses.map((item) => <option key={item} value={item}>{bookingStatusLabel(item)}</option>)}
          </select>
        </div>
        <p>{bookings.status === "ready" ? `${bookings.items.length} of ${bookings.total} bookings` : ""}</p>
      </div>
      {bookings.status === "loading" && <p role="status" className="ws-notice">Loading server bookings…</p>}
      {bookings.error && <p role="alert" className="ws-alert">{bookings.error} <button type="button" className="location-link" onClick={bookings.refresh}>Try again</button></p>}
      {bookings.status === "ready" && bookings.items.length ? <ul className="ws-list">
        {bookings.items.map((booking) => <li className="ws-row" key={booking.id}>
          <div><h3>{booking.serviceTitle}</h3><p>{dateOnly(booking.createdAt)} · {booking.deliveryMode === "onsite" ? "On-site" : booking.deliveryMode === "remote" ? "Remote" : "Work mode unavailable"}</p></div>
          <div className="ws-row__side"><span className="ws-price">{booking.estimatedPrice === null ? "Estimate unavailable" : booking.estimatedPrice.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</span><StatusBadge status={booking.status} /><Link to={`/seller-dashboard/orders/${encodeURIComponent(booking.id)}`}>{booking.status === "Requested" ? "Review" : "Details"}</Link></div>
        </li>)}
      </ul> : bookings.status === "ready" ? <Empty title={status ? `No ${bookingStatusLabel(status).toLowerCase()} bookings.` : "No bookings yet."}>Customer requests will appear here after the server accepts their booking submission.</Empty> : null}
      {bookings.hasMore && <div className="market-load-more"><button className="button button--secondary" type="button" disabled={bookings.loadingMore} onClick={() => void bookings.loadMore()}>{bookings.loadingMore ? "Loading…" : "Load more"}</button></div>}
    </SellerFrame>
  );
}

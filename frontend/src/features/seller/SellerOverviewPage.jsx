import { Link } from "react-router-dom";
import { money } from "../../utils/money.js";
import { Empty, Stat, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import { useAuth } from "../account/authContext.js";
import { useBookingList } from "../bookings/useBookingList.js";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

export default function SellerOverviewPage() {
  const { profile, services } = useSeller();
  const { user, logout } = useAuth();
  const bookingPage = useBookingList("seller", "", user?.id, logout);
  const bookings = bookingPage.items;
  const live = services.filter((item) => item.active && item.availability === "Open" && !item.hidden).length;
  return (
    <SellerFrame serverBacked title={profile ? `Halo, ${profile.name}.` : "Seller Center."} description="Booking requests and statuses are read from the Digarsa server.">
      <div className="ws-stats seller-kpis" aria-label="Seller statistics">
        <Stat to="/seller-dashboard/orders" label="Total bookings" value={bookingPage.status === "ready" ? bookingPage.total : "—"} note="Server total" />
        <Stat to="/seller-dashboard/orders?status=Requested" label="Incoming requests" value={bookings.filter((row) => row.status === "Requested").length} note="On the loaded page" />
        <Stat to="/seller-dashboard/services" label="Active services" value={live} note="Service workspace" />
        <Stat label="Finance" value="Unavailable" note="Payment and payout are not connected" />
      </div>
      {bookingPage.status === "loading" && <p role="status" className="ws-notice">Loading server bookings…</p>}
      {bookingPage.error && <p role="alert" className="ws-alert">{bookingPage.error} <button type="button" className="location-link" onClick={bookingPage.refresh}>Try again</button></p>}
      <section className="ws-section" aria-labelledby="waiting-heading">
        <header><h2 id="waiting-heading">Recent booking activity.</h2><Link to="/seller-dashboard/orders">All bookings</Link></header>
        {bookings.length ? <ul className="ws-list">{bookings.slice(0, 5).map((booking) => <li className="ws-row" key={booking.id}>
          <div><h3>{booking.serviceTitle}</h3><p>Customer · requested {dateOnly(booking.createdAt)} · {booking.deliveryMode === "onsite" ? "On-site" : booking.deliveryMode === "remote" ? "Remote" : "Work mode unavailable"}</p></div>
          <div className="ws-row__side"><span className="ws-price">{booking.estimatedPrice === null ? "Estimate unavailable" : money(booking.estimatedPrice)}</span><StatusBadge status={booking.status} /><Link to={`/seller-dashboard/orders/${encodeURIComponent(booking.id)}`}>{booking.status === "Requested" ? "Review" : "Details"}</Link></div>
        </li>)}</ul> : bookingPage.status === "ready" ? <Empty title="No booking activity yet.">Customer requests appear after a server-accepted booking submission.</Empty> : null}
        {bookingPage.hasMore && <button type="button" className="button button--secondary" disabled={bookingPage.loadingMore} onClick={() => void bookingPage.loadMore()}>{bookingPage.loadingMore ? "Loading…" : "Load more"}</button>}
      </section>
      {profile && <section className="ws-section" aria-labelledby="profile-heading"><header><h2 id="profile-heading">Your seller profile.</h2><Link to="/seller-dashboard/profile">Edit profile</Link></header><div className="ws-panel ws-profile-card">{profile.image ? <img src={profile.image} alt="" /> : <span className="ws-avatar" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>}<div><h3>{profile.name}</h3><p>{profile.category} · {profile.city}</p><Link className="ws-link" to={`/seller/${profile.id}`}>View public profile</Link></div></div></section>}
    </SellerFrame>
  );
}

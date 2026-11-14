import { bookingStatusLabel } from "./bookingLifecycle";
import { Link } from "react-router-dom";
import { useCatalog } from "../catalog/useCatalog";
import { useMessaging } from "../messaging/useMessaging";
import { customerMessaging } from "../messaging/customerMessagingClient";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingCard from "./BookingCard";
import SavedServiceCard from "./SavedServiceCard";
import { useCustomer } from "./useCustomer";
import { customerOverview } from "./customerOverview";
import { useBookingList } from "../bookings/useBookingList.js";
import { useAuth } from "../account/authContext.js";

export default function DashboardPage() {
  useCatalog();
  const { user: storedUser, logout } = useAuth();
  const { savedItems, favoriteItems } = useCustomer();
  const user = storedUser || { name: "there", id: "" };
  const bookingPage = useBookingList("customer", "", user.id, logout);
  const bookings = bookingPage.items;
  const { data: counts, error } = useMessaging(() => customerMessaging.counts());
  const overview = customerOverview(bookings);
  const statistics = [
    ["Server bookings", bookingPage.status === "ready" ? bookingPage.total : "—", "/orders"],
    ["Service favorit", savedItems.favorites.status === "ready" ? savedItems.favorites.total : "—", "/favorites"],
    ["Di keranjang", savedItems.cart.status === "ready" ? savedItems.cart.total : "—", "/cart"],
  ];
  return (
    <CustomerFrame serverBacked
      title={`Halo, ${user.name.split(" ")[0]}.`}
      description="Tempat ide tersimpan dan kolaborasi terus bertumbuh."
    >
      <section className="customer-welcome" aria-label="Mulai kolaborasi">
        <div>
          <span className="market-kicker">RUANG UNTUK IDE BERIKUTNYA</span>
          <h2>Great work starts<br />with the right connection.</h2>
          <Link className="button button--primary" to="/marketplace">
            Find creators
          </Link>
        </div>
        <div className="customer-welcome-total">
          <strong>{bookingPage.status === "ready" ? bookingPage.total : "—"}</strong>
          <span>server booking<br />records</span>
        </div>
      </section>
      <section className="customer-stats" aria-label="Overview akun">
        {statistics.map(([label, value, to]) => (
          <Link key={label} to={to}>
            <span>{label}<span aria-hidden="true"></span></span>
            <strong>{value}</strong>
          </Link>
        ))}
      </section>
      <div className="customer-dashboard-grid">
        <div>
          <section className="customer-dashboard-panel">
            <div className="customer-section-heading">
              <div>
                <span className="market-kicker">GAMBARAN BOOKING</span>
                <h2>Server booking status.</h2>
              </div>
              <span className="customer-list-caption">{bookingPage.status === "ready" ? `${bookingPage.total} total` : "Loading…"}</span>
            </div>
            {bookingPage.status === "loading" ? <p role="status">Loading your booking summary…</p> : bookingPage.error ? <p role="alert" className="customer-warning">{bookingPage.error} <button type="button" onClick={bookingPage.refresh}>Try again</button></p> : bookings.length ? (
              <div className="customer-status-overview">
                {bookings.slice(0, 6).map((booking) => (
                  <Link key={booking.id} to={`/orders/${encodeURIComponent(booking.id)}`}>
                    <span>{booking.serviceTitle}</span>
                    <strong>{bookingStatusLabel(booking.status)}</strong>
                    <span className="customer-list-caption">{booking.createdAt ? new Date(booking.createdAt).toLocaleDateString("en-US") : "Date unavailable"}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p>No order data yet. Your stats will appear after you send your first project request.</p>
            )}
            <p className="customer-list-caption">
              Showing recent server records; status and payment remain server-owned.
            </p>
          </section>
          <section className="customer-dashboard-panel">
            <div className="customer-section-heading">
              <h2>Aktivitas terbaru.</h2>
              <Link to="/orders">All orders </Link>
            </div>
            {overview.recent.length ? (
              <div className="customer-recent-orders">
                {overview.recent.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            ) : (
              <EmptyState title="Mulai cerita kolaborasimu.">
                Share what you need to find services that fit your project.
              </EmptyState>
            )}
          </section>
        </div>
        <aside className="customer-dashboard-aside">
          <section className="customer-dashboard-panel">
            <span className="market-kicker">TETAP TERHUBUNG</span>
            <h2>Kabar kolaborasi.</h2>
            {error ? (
              <p role="alert" className="customer-warning">{error}</p>
            ) : (
              <div className="customer-communication">
                <Link to="/messages">
                  <span>My Messages<small>Pesan unread</small></span>
                  <strong>{counts?.messages ?? "—"}</strong>
                </Link>
                <Link to="/notifications">
                  <span>My Notifications<small>Kabar unread</small></span>
                  <strong>{counts?.notifications ?? "—"}</strong>
                </Link>
              </div>
            )}
            <Link className="customer-profile-action" to="/profile">
              Manage your profile
            </Link>
          </section>
          <section className="customer-dashboard-panel">
            <div className="customer-section-heading">
              <h2>Pilihan tersimpan.</h2>
              <Link to="/favorites">All </Link>
            </div>
            {savedItems.favorites.status === "loading" ? <p role="status">Loading saved services…</p> : savedItems.favorites.error ? <p role="alert">{savedItems.favorites.error.message}</p> : favoriteItems.length ? favoriteItems.slice(0, 2).map((item) => (
              <SavedServiceCard key={item.serviceId} service={item.service} id={item.serviceId} available={item.available} />
            )) : (
              <p>Your favorite services will appear here. Save work that inspires you to collaborate.</p>
            )}
          </section>
        </aside>
      </div>
    </CustomerFrame>
  );
}

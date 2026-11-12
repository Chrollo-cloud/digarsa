import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { statuses } from "../customer/customerStore";
import { dateTime } from "../workspace/format";
import { Empty, Stat, StatusBadge } from "../workspace/WorkspaceFrame";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

const dashboardSnapshotTime = Date.now();

export default function AdminOverviewPage() {
  const { accounts, services, bookings, error } = useAdmin();
  const now = dashboardSnapshotTime;
  const customers = accounts.filter((item) => item.isCustomer).length;
  const sellers = accounts.filter((item) => item.isSeller).length;
  const hidden = services.filter((item) => item.hidden).length;
  const recentBookings = bookings.filter((item) => {
    const created = Date.parse(item.createdAt);
    return Number.isFinite(created) && created <= now && now - created <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const activeBookings = bookings.filter((item) =>
    ["Requested", "Accepted", "Paid"].includes(item.status),
  ).length;
  const completedBookings = bookings.filter((item) => item.status === "Completed").length;
  const volume = bookings
    .filter((item) => item.status === "Completed")
    .reduce((sum, item) => sum + item.estimatedPrice, 0);
  return (
    <AdminFrame
      title="Admin Dashboard."
      description="Monitor accounts, services, and orders across customers and sellers. This page requires internal Admin permission."
    >
      {error ? <div className="ws-empty"><h2>Dashboard data unavailable.</h2><p>Check demo storage, then reload the page.</p></div> : <>
      <div className="ws-stats">
        <Stat to="/admin/accounts" label="Total users" value={accounts.length} note="Registered accounts" />
        <Stat to="/admin/accounts?role=customer" label="Customer" value={customers} note="Akun dengan akses pemesanan" />
        <Stat to="/admin/accounts?role=seller" label="Seller" value={sellers} note="Active Seller Profiles" />
        <Stat to="/admin/moderation" label="Total services" value={services.length} note={`${hidden} hidden by Admin`} />
        <Stat to="/admin/orders" label="Total bookings" value={bookings.length} note={`${activeBookings} in progress`} />
        <Stat label="Completed booking value" value={money(volume)} note={`${completedBookings} bookings · estimates, not transactions`} />
      </div>
      <section className="ws-section" aria-labelledby="activity-heading">
        <header>
          <h2 id="activity-heading">Marketplace activity.</h2>
          <Link to="/admin/orders">Open order monitor</Link>
        </header>
        <div className="ws-stats admin-activity-stats">
          <Stat label="Bookings in the last 7 days" value={recentBookings} note="Based on request date" />
          <Stat label="Active bookings" value={activeBookings} note="Requested, Accepted, or Paid" />
          <Stat label="Published services" value={services.filter((item) => item.active && !item.hidden).length} note="Active and not moderated" />
          <Stat label="Inactive services" value={services.filter((item) => !item.active && !item.hidden).length} note="Disabled by Seller" />
        </div>
      </section>
      <section className="ws-section" aria-labelledby="status-heading">
        <header>
          <h2 id="status-heading">Orders by status.</h2>
          <Link to="/admin/orders">Monitor orders</Link>
        </header>
        <ul className="ws-list">
          {statuses.map((status) => (
            <li className="ws-row" key={status}>
              <StatusBadge status={status} />
              <span className="ws-price">
                {bookings.filter((item) => item.status === status).length}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="ws-section" aria-labelledby="recent-bookings-heading">
        <header>
          <h2 id="recent-bookings-heading">Recent bookings.</h2>
          <Link to="/admin/orders">All bookings</Link>
        </header>
        {!bookings.length ? (
          <Empty title="No bookings yet.">Activity will appear after a Customer submits a booking request.</Empty>
        ) : (
          <ul className="ws-list">
            {bookings.slice(0, 5).map((booking) => (
              <li className="ws-row" key={booking.id}>
                <div>
                  <h3>{booking.serviceTitle}</h3>
                  <p>{dateTime(booking.createdAt)} · {booking.creatorName || "Marketplace Digarsa"}</p>
                </div>
                <StatusBadge status={booking.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      </>}
    </AdminFrame>
  );
}

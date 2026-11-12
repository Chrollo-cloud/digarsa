import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, Stat, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { summarizePerformance } from "./earnings";
import { summarizeSellerDashboard } from "./sellerAnalytics";
import BookingTrend from "./BookingTrend";

export default function SellerOverviewPage() {
  const { profile, bookings, services, customers } = useSeller();
  const performance = summarizePerformance(bookings);
  const live = services.filter(
    (item) => item.active && item.availability === "Open" && !item.hidden,
  ).length;
  const kpis = summarizeSellerDashboard(bookings, services);
  const recent = [...bookings]
    .sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
    )
    .slice(0, 5);
  return (
    <SellerFrame
      title={profile ? `Halo, ${profile.name}.` : "Seller Center."}
      description="Pantau permintaan masuk, kelola services, dan lihat estimasi pendapatanmu di satu tempat."
    >
      <div className="ws-stats seller-kpis" aria-label="Seller statistics">
        <Stat
          to="/seller-dashboard/orders?status=Requested"
          label="Incoming requests"
          value={kpis.requested}
          note="Pending keputusanmu"
        />
        <Stat
          to="/seller-dashboard/services"
          label="Active services"
          value={kpis.activeServices}
          note={`${live} available · fully booked remain active`}
        />
        <Stat
          to="/seller-dashboard/orders?status=Accepted"
          label="Accepted bookings"
          value={kpis.accepted}
          note="Accepted · unpaid"
        />
        <Stat
          to="/seller-dashboard/orders?status=Completed"
          label="Completed bookings"
          value={kpis.completed}
          note="Status Completed"
        />
        <Stat
          to="/seller-dashboard/orders"
          label="Total bookings"
          value={kpis.total}
          note="All request statuses"
        />
        <Stat
          to="/seller-dashboard/earnings"
          label="Estimated completed bookings"
          value={money(kpis.estimatedCompleted)}
          note="Starting price · not a received payment"
        />
      </div>
      <BookingTrend bookings={bookings} />

      <section className="ws-section" aria-labelledby="performance-heading">
        <header>
          <h2 id="performance-heading">Performa seller.</h2>
        </header>
        <div className="ws-stats">
          <Stat
            label="Order response rate"
            value={`${performance.responseRate}%`}
            note="orders with a decision"
          />
          <Stat
            label="Accepted requests"
            value={`${performance.acceptanceRate}%`}
            note="of orders yang diputuskan"
          />
          <Stat
            label="Completion rate"
            value={`${performance.completionRate}%`}
            note="of accepted orders"
          />
        </div>
        <p className="ws-note">
          Statistics use available booking statuses; reviews and payments are not included.
        </p>
      </section>

      <section className="ws-section" aria-labelledby="waiting-heading">
        <header>
          <h2 id="waiting-heading">Recent booking activity.</h2>
          <Link to="/seller-dashboard/orders">All orders </Link>
        </header>
        {recent.length ? (
          <ul className="ws-list">
            {recent.map((booking) => (
              <li className="ws-row" key={booking.id}>
                <div>
                  <h3>{booking.serviceTitle}</h3>
                  <p>
                    {customers[booking.customerId] || "Customer"} · requested{" "}
                    {dateOnly(booking.createdAt)} ·{" "}
                    {booking.deliveryMode === "onsite" ? "On-site" : "Remote"}
                  </p>
                </div>
                <div className="ws-row__side">
                  <span className="ws-price">
                    {money(booking.estimatedPrice)}
                  </span>
                  <StatusBadge status={booking.status} />
                  <Link to={`/seller-dashboard/orders/${booking.id}`}>
                    {booking.status === "Requested" ? "Review " : "Details "}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No booking activity yet.">
            Customer requests appear here when they submit a booking for your services.
          </Empty>
        )}
      </section>

      <section className="ws-section" aria-labelledby="profile-heading">
        <header>
          <h2 id="profile-heading">Your public profile.</h2>
          <Link to="/seller-dashboard/profile">Edit profile </Link>
        </header>
        {profile && (
          <div className="ws-panel ws-profile-card">
            {profile.image ? (
              <img src={profile.image} alt="" />
            ) : (
              <span className="ws-avatar" aria-hidden="true">
                {profile.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <h3>{profile.name}</h3>
              <p>
                {profile.category} · {profile.city}
              </p>
              <Link className="ws-link" to={`/seller/${profile.id}`}>
                View as a customer
              </Link>
            </div>
          </div>
        )}
        <div className="seller-quick-links">
          <Link
            className="button button--secondary"
            to="/seller-dashboard/services"
          >
            Manage services
          </Link>
          <Link
            className="button button--secondary"
            to="/seller-dashboard/services/new"
          >
            Add service
          </Link>
        </div>
        {services.length === 0 && (
          <p className="ws-notice">
            You do not have any services yet. New customers can book after you{" "}
            <Link className="ws-link" to="/seller-dashboard/services/new">
              add your first service
            </Link>
            .
          </p>
        )}
      </section>
    </SellerFrame>
  );
}

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
      description="Pantau permintaan masuk, kelola layanan, dan lihat estimasi pendapatanmu di satu tempat."
    >
      <div className="ws-stats seller-kpis" aria-label="Statistik Seller">
        <Stat
          to="/seller-dashboard/orders?status=Requested"
          label="Permintaan masuk"
          value={kpis.requested}
          note="Menunggu keputusanmu"
        />
        <Stat
          to="/seller-dashboard/services"
          label="Layanan aktif"
          value={kpis.activeServices}
          note={`${live} Open · Full-book tetap aktif`}
        />
        <Stat
          to="/seller-dashboard/orders?status=Accepted"
          label="Booking diterima"
          value={kpis.accepted}
          note="Diterima Seller · belum dibayar"
        />
        <Stat
          to="/seller-dashboard/orders?status=Completed"
          label="Booking selesai"
          value={kpis.completed}
          note="Status Selesai"
        />
        <Stat
          to="/seller-dashboard/orders"
          label="Total booking"
          value={kpis.total}
          note="Seluruh status permintaan"
        />
        <Stat
          to="/seller-dashboard/earnings"
          label="Estimasi booking selesai"
          value={money(kpis.estimatedCompleted)}
          note="Harga awal · bukan pembayaran diterima"
        />
      </div>
      <BookingTrend bookings={bookings} />

      <section className="ws-section" aria-labelledby="performance-heading">
        <header>
          <h2 id="performance-heading">Performa seller.</h2>
        </header>
        <div className="ws-stats">
          <Stat
            label="Respons pesanan"
            value={`${performance.responseRate}%`}
            note="pesanan yang sudah diputuskan"
          />
          <Stat
            label="Permintaan diterima"
            value={`${performance.acceptanceRate}%`}
            note="dari pesanan yang diputuskan"
          />
          <Stat
            label="Penyelesaian"
            value={`${performance.completionRate}%`}
            note="dari pesanan yang diterima"
          />
        </div>
        <p className="ws-note">
          Statistik dihitung dari status booking yang tersedia; belum mencakup
          ulasan atau pembayaran.
        </p>
      </section>

      <section className="ws-section" aria-labelledby="waiting-heading">
        <header>
          <h2 id="waiting-heading">Aktivitas booking terbaru.</h2>
          <Link to="/seller-dashboard/orders">Semua pesanan →</Link>
        </header>
        {recent.length ? (
          <ul className="ws-list">
            {recent.map((booking) => (
              <li className="ws-row" key={booking.id}>
                <div>
                  <h3>{booking.serviceTitle}</h3>
                  <p>
                    {customers[booking.customerId] || "Pelanggan"} · diajukan{" "}
                    {dateOnly(booking.createdAt)} ·{" "}
                    {booking.deliveryMode === "onsite" ? "Onsite" : "Remote"}
                  </p>
                </div>
                <div className="ws-row__side">
                  <span className="ws-price">
                    {money(booking.estimatedPrice)}
                  </span>
                  <StatusBadge status={booking.status} />
                  <Link to={`/seller-dashboard/orders/${booking.id}`}>
                    {booking.status === "Requested" ? "Tinjau →" : "Detail →"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Belum ada aktivitas booking.">
            Permintaan dari pelanggan muncul di sini begitu mereka mengirim
            booking untuk layananmu.
          </Empty>
        )}
      </section>

      <section className="ws-section" aria-labelledby="profile-heading">
        <header>
          <h2 id="profile-heading">Profil publikmu.</h2>
          <Link to="/seller-dashboard/profile">Ubah profil →</Link>
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
                Lihat sebagai pelanggan ↗
              </Link>
            </div>
          </div>
        )}
        <div className="seller-quick-links">
          <Link
            className="button button--secondary"
            to="/seller-dashboard/services"
          >
            Kelola layanan ↗
          </Link>
          <Link
            className="button button--secondary"
            to="/seller-dashboard/services/new"
          >
            Tambah layanan +
          </Link>
        </div>
        {services.length === 0 && (
          <p className="ws-notice">
            Kamu belum punya layanan. Pelanggan baru bisa memesan setelah kamu{" "}
            <Link className="ws-link" to="/seller-dashboard/services/new">
              menambahkan layanan pertama
            </Link>
            .
          </p>
        )}
      </section>
    </SellerFrame>
  );
}

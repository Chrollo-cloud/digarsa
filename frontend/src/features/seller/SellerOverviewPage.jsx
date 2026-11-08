import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, Stat, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { summarizeEarnings, summarizePerformance } from "./earnings";

export default function SellerOverviewPage() {
  const { profile, bookings, services, customers } = useSeller();
  const totals = summarizeEarnings(bookings);
  const performance = summarizePerformance(bookings);
  const live = services.filter(
    (item) => item.active && item.availability === "Open" && !item.hidden,
  ).length;
  const waiting = totals.pending.rows.slice(0, 5);
  return (
    <SellerFrame
      title={profile ? `Halo, ${profile.name}.` : "Seller Center."}
      description="Pantau permintaan masuk, kelola layanan, dan lihat estimasi pendapatanmu di satu tempat."
    >
      <div className="ws-stats">
        <Stat
          to="/seller-dashboard/services"
          label="Jumlah layanan"
          value={services.length}
          note={`${services.filter((item) => item.active).length} aktif`}
        />
        <Stat
          to="/seller-dashboard/orders?status=Requested"
          label="Menunggu respons"
          value={totals.pending.count}
          note="Perlu diterima atau ditolak"
        />
        <Stat
          to="/seller-dashboard/orders"
          label="Sedang dikerjakan"
          value={totals.inProgress.count}
          note="Diterima / dibayar"
        />
        <Stat
          to="/seller-dashboard/earnings"
          label="Selesai"
          value={totals.completed.count}
          note="pesanan selesai"
        />
        <Stat
          to="/seller-dashboard/earnings"
          label="Pendapatan estimasi"
          value={money(totals.completed.total)}
          note="dari booking selesai"
        />
        <Stat
          to="/seller-dashboard/services"
          label="Layanan menerima booking"
          value={live}
          note="aktif, Open, dan tidak dimoderasi"
        />
      </div>

      <section className="ws-section" aria-labelledby="performance-heading">
        <header><h2 id="performance-heading">Performa seller.</h2></header>
        <div className="ws-stats">
          <Stat label="Respons pesanan" value={`${performance.responseRate}%`} note="pesanan yang sudah diputuskan" />
          <Stat label="Permintaan diterima" value={`${performance.acceptanceRate}%`} note="dari pesanan yang diputuskan" />
          <Stat label="Penyelesaian" value={`${performance.completionRate}%`} note="dari pesanan yang diterima" />
        </div>
        <p className="ws-note">Statistik dihitung dari status booking yang tersedia; belum mencakup ulasan atau pembayaran.</p>
      </section>

      <section className="ws-section" aria-labelledby="waiting-heading">
        <header>
          <h2 id="waiting-heading">Menunggu keputusanmu.</h2>
          <Link to="/seller-dashboard/orders">Semua pesanan →</Link>
        </header>
        {waiting.length ? (
          <ul className="ws-list">
            {waiting.map((booking) => (
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
                  <span className="ws-price">{money(booking.estimatedPrice)}</span>
                  <StatusBadge status={booking.status} />
                  <Link to={`/seller-dashboard/orders/${booking.id}`}>
                    Tinjau →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Belum ada permintaan baru.">
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

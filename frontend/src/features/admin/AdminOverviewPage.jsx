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
      description="Pantau akun, layanan, dan pesanan lintas pelanggan serta seller. Halaman ini hanya untuk izin admin internal."
    >
      {error ? <div className="ws-empty"><h2>Data dashboard belum tersedia.</h2><p>Periksa penyimpanan demo, lalu muat ulang halaman.</p></div> : <>
      <div className="ws-stats">
        <Stat to="/admin/accounts" label="Total pengguna" value={accounts.length} note="Akun terdaftar" />
        <Stat to="/admin/accounts?role=customer" label="Customer" value={customers} note="Akun dengan akses pemesanan" />
        <Stat to="/admin/accounts?role=seller" label="Seller" value={sellers} note="Profil Seller aktif" />
        <Stat to="/admin/moderation" label="Total layanan" value={services.length} note={`${hidden} disembunyikan Admin`} />
        <Stat to="/admin/orders" label="Total booking" value={bookings.length} note={`${activeBookings} masih berjalan`} />
        <Stat label="Nilai booking selesai" value={money(volume)} note={`${completedBookings} booking · estimasi, bukan transaksi`} />
      </div>
      <section className="ws-section" aria-labelledby="activity-heading">
        <header>
          <h2 id="activity-heading">Aktivitas marketplace.</h2>
          <Link to="/admin/orders">Buka monitor pesanan →</Link>
        </header>
        <div className="ws-stats admin-activity-stats">
          <Stat label="Booking 7 hari terakhir" value={recentBookings} note="Berdasarkan tanggal permintaan" />
          <Stat label="Booking aktif" value={activeBookings} note="Requested, Accepted, atau Paid" />
          <Stat label="Layanan tayang" value={services.filter((item) => item.active && !item.hidden).length} note="Aktif dan tidak dimoderasi" />
          <Stat label="Layanan nonaktif" value={services.filter((item) => !item.active && !item.hidden).length} note="Dinonaktifkan Seller" />
        </div>
      </section>
      <section className="ws-section" aria-labelledby="status-heading">
        <header>
          <h2 id="status-heading">Pesanan per status.</h2>
          <Link to="/admin/orders">Monitor pesanan →</Link>
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
          <h2 id="recent-bookings-heading">Booking terbaru.</h2>
          <Link to="/admin/orders">Semua booking →</Link>
        </header>
        {!bookings.length ? (
          <Empty title="Belum ada booking.">Aktivitas akan tercatat setelah Customer mengirim permintaan booking.</Empty>
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

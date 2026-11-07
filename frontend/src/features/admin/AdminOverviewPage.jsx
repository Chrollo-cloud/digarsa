import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { statuses } from "../customer/customerStore";
import { Stat, StatusBadge } from "../workspace/WorkspaceFrame";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminOverviewPage() {
  const { accounts, services, bookings } = useAdmin();
  const sellers = accounts.filter((item) => item.isSeller).length;
  const hidden = services.filter((item) => item.hidden).length;
  const volume = bookings
    .filter((item) => item.status === "Completed")
    .reduce((sum, item) => sum + item.estimatedPrice, 0);
  return (
    <AdminFrame
      title="Admin Dashboard."
      description="Pantau akun, layanan, dan pesanan lintas pelanggan serta seller. Halaman ini hanya untuk izin admin internal."
    >
      <div className="ws-stats">
        <Stat to="/admin/accounts" label="Akun" value={accounts.length} note={`${sellers} seller`} />
        <Stat to="/admin/moderation" label="Layanan" value={services.length} note={`${hidden} disembunyikan`} />
        <Stat to="/admin/orders" label="Pesanan" value={bookings.length} note="Semua pelanggan" />
        <Stat label="Nilai selesai" value={money(volume)} note="Estimasi, bukan transaksi" />
      </div>
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
    </AdminFrame>
  );
}

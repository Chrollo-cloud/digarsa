import { bookingStatusLabel } from "./bookingLifecycle";
import { Link } from "react-router-dom";
import { services } from "../../data/marketplace";
import { useCatalog } from "../catalog/useCatalog";
import { useMessaging } from "../messaging/useMessaging";
import { customerMessaging } from "../messaging/customerMessagingClient";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingCard from "./BookingCard";
import SavedServiceCard from "./SavedServiceCard";
import { useCustomer } from "./useCustomer";
import { customerOverview } from "./customerOverview";

export default function DashboardPage() {
  useCatalog();
  const { user, favorites, cart, bookings } = useCustomer();
  const { data: counts, error } = useMessaging(() => customerMessaging.counts());
  const overview = customerOverview(bookings);
  const saved = services.filter((row) => favorites.includes(row.id));
  const statistics = [
    ["Booking aktif", overview.active, "/orders"],
    ["Kolaborasi selesai", overview.completed, "/orders?status=Completed"],
    ["Favorite", favorites.length, "/favorites"],
    ["Di keranjang", cart.length, "/cart"],
  ];
  return (
    <CustomerFrame
      title={`Halo, ${user.name.split(" ")[0]}.`}
      description="Tempat ide tersimpan dan kolaborasi terus bertumbuh."
    >
      <section className="customer-welcome" aria-label="Mulai kolaborasi">
        <div>
          <span className="market-kicker">RUANG UNTUK IDE BERIKUTNYA</span>
          <h2>Karya baik dimulai<br />dari koneksi yang tepat.</h2>
          <Link className="button button--primary" to="/marketplace">
            Temukan kreator ↗
          </Link>
        </div>
        <div className="customer-welcome-total">
          <strong>{bookings.length}</strong>
          <span>permintaan booking<br />dari perjalananmu sejauh ini</span>
        </div>
      </section>
      <section className="customer-stats" aria-label="Ringkasan akun">
        {statistics.map(([label, value, to]) => (
          <Link key={label} to={to}>
            <span>{label}<span aria-hidden="true">↗</span></span>
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
                <h2>Setiap langkah berarti.</h2>
              </div>
              <span className="customer-list-caption">{bookings.length} total</span>
            </div>
            {bookings.length ? (
              <div className="customer-status-overview">
                {overview.statuses.map(({ status, count }) => (
                  <Link key={status} to={`/orders?status=${status}`}>
                    <span>{bookingStatusLabel(status)}</span>
                    <strong>{count}</strong>
                    <span className="customer-status-meter" aria-hidden="true">
                      <i style={{ width: `${count / bookings.length * 100}%` }} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p>Belum ada data pesanan. Statistik akan muncul setelah kamu mengirim kebutuhan pertama.</p>
            )}
            <p className="customer-list-caption">
              Dihitung dari status booking saat ini · bukan data pembayaran.
            </p>
          </section>
          <section className="customer-dashboard-panel">
            <div className="customer-section-heading">
              <h2>Aktivitas terbaru.</h2>
              <Link to="/orders">Semua pesanan ↗</Link>
            </div>
            {overview.recent.length ? (
              <div className="customer-recent-orders">
                {overview.recent.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            ) : (
              <EmptyState title="Mulai cerita kolaborasimu.">
                Kirim kebutuhan untuk layanan yang sesuai dengan kebutuhanmu.
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
                  <span>Pesan Saya<small>Pesan belum dibaca</small></span>
                  <strong>{counts?.messages ?? "—"}</strong>
                </Link>
                <Link to="/notifications">
                  <span>Notifikasi Saya<small>Kabar belum dibaca</small></span>
                  <strong>{counts?.notifications ?? "—"}</strong>
                </Link>
              </div>
            )}
            <Link className="customer-profile-action" to="/profile">
              Kelola profil pribadi ↗
            </Link>
          </section>
          <section className="customer-dashboard-panel">
            <div className="customer-section-heading">
              <h2>Favorite pilihan.</h2>
              <Link to="/favorites">Semua ↗</Link>
            </div>
            {saved.length ? saved.slice(0, 2).map((service) => (
              <SavedServiceCard key={service.id} service={service} id={service.id} />
            )) : (
              <p>Favorite kamu akan muncul di sini. Simpan karya yang membuatmu ingin berkolaborasi.</p>
            )}
          </section>
        </aside>
      </div>
    </CustomerFrame>
  );
}

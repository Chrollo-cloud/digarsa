import { Link } from "react-router-dom";
import { services } from "../../data/marketplace";
import ServiceCard from "../../components/marketplace/ServiceCard";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingCard from "./BookingCard";
import { useCustomer } from "./useCustomer";

export default function DashboardPage() {
  const { user, favorites, cart, bookings } = useCustomer();
  const active = bookings.filter((booking) =>
    ["Requested", "Accepted", "Paid"].includes(booking.status),
  );
  const saved = services.filter((service) => favorites.includes(service.id));
  return (
    <CustomerFrame
      title={`Halo, ${user.name.split(" ")[0]}.`}
      description="Ruang untuk menyimpan ide dan mengikuti setiap kolaborasi."
    >
      <div className="customer-stats">
        {[
          ["Permintaan aktif", active.length, "/orders"],
          ["Semua pesanan", bookings.length, "/orders"],
          ["Disimpan", favorites.length, "/favorites"],
          ["Dipertimbangkan", cart.length, "/cart"],
        ].map(([label, value, to]) => (
          <Link key={label} to={to}>
            <span>{label}</span>
            <strong>{value}</strong>
          </Link>
        ))}
      </div>
      <section className="customer-section">
        <div className="customer-section-heading">
          <h2>Kolaborasi berjalan.</h2>
          <Link to="/orders">Semua pesanan ↗</Link>
        </div>
        {active.length ? (
          <div className="customer-booking-grid">
            {active.slice(0, 3).map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        ) : (
          <EmptyState title="Belum ada permintaan aktif.">
            Temukan partner kreatif dan mulai dengan brief yang jelas.
          </EmptyState>
        )}
      </section>
      <section className="customer-section">
        <h2>Aktivitas terbaru.</h2>
        {bookings.length ? (
          <div className="customer-booking-grid">
            {bookings.slice(0, 3).map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        ) : (
          <EmptyState title="Cerita kolaborasimu dimulai di sini.">
            Aktivitas pesanan akan muncul setelah kamu mengirim permintaan.
          </EmptyState>
        )}
      </section>
      <section className="customer-section">
        <div className="customer-section-heading">
          <h2>Disimpan untuk nanti.</h2>
          <Link to="/favorites">Semua favorit ↗</Link>
        </div>
        {saved.length ? (
          <div className="customer-service-grid">
            {saved.slice(0, 3).map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <EmptyState title="Simpan karya yang menarik perhatianmu.">
            Gunakan tombol Simpan untuk mengumpulkan ide.
          </EmptyState>
        )}
      </section>
    </CustomerFrame>
  );
}

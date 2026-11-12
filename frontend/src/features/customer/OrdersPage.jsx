import { bookingStatusLabel } from "./bookingLifecycle";
import { useLocation, useSearchParams } from "react-router-dom";
import { statuses } from "./customerStore";
import { useCustomer } from "./useCustomer";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingCard from "./BookingCard";
export default function OrdersPage() {
  const { bookings, user } = useCustomer();
  const [params] = useSearchParams();
  const location = useLocation();
  return <OrderList key={user.id} bookings={bookings} createdCount={params.getAll("created").length} notificationWarning={location.state?.notificationWarning} />;
}
function OrderList({ bookings, createdCount, notificationWarning }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("status") || "";
  const status = statuses.includes(requested) ? requested : "";
  function setStatus(value) { setParams(value ? { status: value } : {}, { replace: true }); }
  const visible = bookings.filter(
    (booking) => !status || status === booking.status,
  );
  return (
    <CustomerFrame
      title="Setiap ide, satu perjalanan."
      description="Pantau permintaan dan riwayat kolaborasimu."
    >
      {createdCount > 0 && <p className="customer-success" role="status">{createdCount} booking request berhasil dikirim. Seller akan meninjau masing-masing permintaan; pembayaran belum dilakukan.</p>}
      {notificationWarning && <p className="customer-warning" role="alert">Booking tersimpan, tetapi sebagian notifikasi Seller belum dapat disimpan. Status pesanan tetap tersedia di sini.</p>}
      <div className="customer-order-tabs" role="group" aria-label="Status pesanan">
        {[["", "Semua"], ...statuses.map((value) => [value, bookingStatusLabel(value)])].map(([value, label]) => (
          <button key={label} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>
            {label} <span>{value ? bookings.filter((row) => row.status === value).length : bookings.length}</span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="customer-order-grid">
          {visible.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            bookings.length
              ? "Tidak ada pesanan pada status ini."
              : "Belum ada permintaan pesanan."
          }
        >
          Setelah mengirim ringkasan kebutuhan, kamu dapat mengikuti prosesnya di sini.
        </EmptyState>
      )}
    </CustomerFrame>
  );
}

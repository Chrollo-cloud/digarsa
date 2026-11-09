import { bookingStatusLabel } from "./bookingLifecycle";
import { useSearchParams } from "react-router-dom";
import { statuses } from "./customerStore";
import { useCustomer } from "./useCustomer";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingCard from "./BookingCard";
export default function OrdersPage() {
  const { bookings, user } = useCustomer();
  return <OrderList key={user.id} bookings={bookings} />;
}
function OrderList({ bookings }) {
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

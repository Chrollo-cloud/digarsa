import { useState } from "react";
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
  const [status, setStatus] = useState("");
  const visible = bookings.filter(
    (booking) => !status || status === booking.status,
  );
  return (
    <CustomerFrame
      title="Setiap ide, satu perjalanan."
      description="Pantau permintaan dan riwayat kolaborasimu."
    >
      <label className="customer-order-filter">
        Status pesanan
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Semua status ({bookings.length})</option>
          {statuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
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
              : "Belum ada permintaan booking."
          }
        >
          Setelah mengirim brief, kamu dapat mengikuti prosesnya di sini.
        </EmptyState>
      )}
    </CustomerFrame>
  );
}

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
      title="Every idea has its own journey."
      description="Track your requests and collaboration history."
    >
      <div className="customer-order-tabs" role="group" aria-label="Order status">
        {[["", "All"], ...statuses.map((value) => [value, bookingStatusLabel(value)])].map(([value, label]) => (
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
              ? "No orders with this status."
              : "No order requests yet."
          }
        >
          After submitting your project brief, you can track its progress here.
        </EmptyState>
      )}
    </CustomerFrame>
  );
}

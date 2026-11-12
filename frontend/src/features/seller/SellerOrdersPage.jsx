import { bookingStatusLabel } from "../customer/bookingLifecycle";
import { Link, useSearchParams } from "react-router-dom";
import { money } from "../../data/marketplace";
import { statuses } from "../customer/customerStore";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

export default function SellerOrdersPage() {
  const { bookings, customers } = useSeller();
  const [params, setParams] = useSearchParams();
  const requested = params.get("status");
  const status = statuses.includes(requested) ? requested : "";
  const rows = status
    ? bookings.filter((booking) => booking.status === status)
    : bookings;
  return (
    <SellerFrame
      title="Orders masuk."
      description="Ini adalah bookings that customers see. Your decision appears on their orders page."
    >
      <div className="ws-toolbar">
        <div className="field">
          <label htmlFor="order-status">Filter by status</label>
          <select
            id="order-status"
            className="field__control"
            value={status}
            onChange={(event) =>
              setParams(event.target.value ? { status: event.target.value } : {})
            }
          >
            <option value="">All status</option>
            {statuses.map((item) => (
              <option key={item} value={item}>{bookingStatusLabel(item)}</option>
            ))}
          </select>
        </div>
        <p>
          {rows.length} of {bookings.length} orders
        </p>
      </div>
      {rows.length ? (
        <ul className="ws-list">
          {rows.map((booking) => (
            <li className="ws-row" key={booking.id}>
              <div>
                <h3>{booking.serviceTitle}</h3>
                <p>
                  <Link to={`/seller-dashboard/buyers/${encodeURIComponent(booking.customerId)}?bookingId=${encodeURIComponent(booking.id)}`}>
                    {customers[booking.customerId] || "Customer"}
                  </Link>{" "}· requested{" "}
                  {dateOnly(booking.createdAt)} ·{" "}
                  {booking.deliveryMode === "onsite" ? "On-site" : "Remote"}
                </p>
              </div>
              <div className="ws-row__side">
                <span className="ws-price">{money(booking.finalPrice ?? booking.estimatedPrice)}</span>
                <StatusBadge status={booking.status} />
                <Link to={`/seller-dashboard/orders/${booking.id}`}>
                  {booking.status === "Requested" ? "Review " : "Details "}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={status ? `No orders ${bookingStatusLabel(status)}.` : "No orders yet."}>
          {status
            ? "Change the filter to see other statuses."
            : "Orders akan muncul saat pelanggan mengajukan booking untuk servicesmu."}
        </Empty>
      )}
    </SellerFrame>
  );
}

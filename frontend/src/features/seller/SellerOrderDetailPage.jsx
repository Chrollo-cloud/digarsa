import { Link, useSearchParams } from "react-router-dom";
import { money } from "../../data/marketplace";
import { statuses } from "../customer/customerStore";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

export default function SellerOrdersPage() {
  const { bookings, customers, customerProfiles } = useSeller();

  const [params, setParams] = useSearchParams();
  const requested = params.get("status");

  const status = statuses.includes(requested) ? requested : "";

  const rows = status
    ? bookings.filter((booking) => booking.status === status)
    : bookings;

  return (
    <SellerFrame
      title="Pesanan masuk."
      description="Lihat pesanan dan informasi pelanggan yang mengajukan booking layananmu."
    >
      <div className="ws-toolbar">
        <div className="field">
          <label htmlFor="order-status">Filter status</label>

          <select
            id="order-status"
            className="field__control"
            value={status}
            onChange={(event) =>
              setParams(
                event.target.value
                  ? { status: event.target.value }
                  : {},
              )
            }
          >
            <option value="">Semua status</option>

            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <p>
          {rows.length} dari {bookings.length} pesanan
        </p>
      </div>

      {rows.length ? (
        <ul className="ws-list">
          {rows.map((booking) => {
            const customer = customerProfiles[booking.customerId];

            return (
              <li className="ws-row" key={booking.id}>
                <div>
                  <h3>{booking.serviceTitle}</h3>

                  <p>
                    Buyer:{" "}
                    <Link
                      className="seller-customer-link"
                      to={`/seller-dashboard/customers/${booking.customerId}`}
                    >
                      {customers[booking.customerId] || "Pelanggan"} ↗
                    </Link>
                  </p>

                  <p>
                    Diajukan {dateOnly(booking.createdAt)} ·{" "}
                    {booking.deliveryMode === "onsite"
                      ? "Onsite"
                      : "Remote"}
                  </p>
                </div>

                <div className="ws-row__side">
                  <span className="ws-price">
                    {money(booking.estimatedPrice)}
                  </span>

                  <StatusBadge status={booking.status} />

                  <Link to={`/seller-dashboard/orders/${booking.id}`}>
                    {booking.status === "Requested"
                      ? "Tinjau →"
                      : "Detail →"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          title={
            status
              ? `Tidak ada pesanan ${status}.`
              : "Belum ada pesanan."
          }
        >
          {status
            ? "Ubah filter untuk melihat status lain."
            : "Pesanan akan muncul saat pelanggan mengajukan booking."}
        </Empty>
      )}
    </SellerFrame>
  );
}
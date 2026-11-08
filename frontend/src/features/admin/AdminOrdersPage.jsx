import { useState } from "react";
import { money } from "../../data/marketplace";
import { statuses } from "../customer/customerStore";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminOrdersPage() {
  const { bookings, accounts, creatorName } = useAdmin();
  const [status, setStatus] = useState("");
  const names = Object.fromEntries(accounts.map((item) => [item.id, item.name]));
  const rows = status ? bookings.filter((item) => item.status === status) : bookings;
  return (
    <AdminFrame
      title="Monitor pesanan."
      description="Tampilan baca-saja dari booking yang sama dengan yang dipakai pelanggan dan seller. Admin tidak mengubah status."
    >
      <div className="ws-toolbar">
        <div className="field">
          <label htmlFor="admin-status">Filter status</label>
          <select id="admin-status" className="field__control" value={status} onChange={(event) => setStatus(event.target.value)}>
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
      {rows.length === 0 ? (
        <Empty title="Belum ada pesanan.">Pesanan muncul saat pelanggan mengajukan booking.</Empty>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th scope="col">Layanan</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Seller</th>
                <th scope="col">Status</th>
                <th scope="col">Estimasi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    {booking.serviceTitle}
                    <small>{dateTime(booking.createdAt)}</small>
                  </td>
                  <td>{names[booking.customerId] || "Akun tidak dikenal"}</td>
                  <td>{creatorName(booking.creatorId)}</td>
                  <td>
                    <StatusBadge status={booking.status} />
                  </td>
                  <td>{money(booking.estimatedPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminFrame>
  );
}

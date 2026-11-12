import { useMemo, useState } from "react";
import { money } from "../../data/marketplace";
import { statuses } from "../customer/customerStore";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminOrdersPage() {
  const { bookings, accounts, creatorName, error } = useAdmin();
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [search, setSearch] = useState("");
  const names = Object.fromEntries(accounts.map((item) => [item.id, item.name]));
  const sellersById = Object.fromEntries(accounts.filter((item) => item.isSeller).map((item) => [item.sellerProfileId, item.sellerName || item.name]));
  const sellerIds = [...new Set(bookings.map((item) => item.creatorId))];
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-US");
    return bookings.filter((booking) => {
      const day = (booking.createdAt || "").slice(0, 10);
      const searchText = [
        booking.id,
        booking.serviceTitle,
        names[booking.customerId],
        creatorName(booking.creatorId),
        booking.creatorId,
      ].join(" ").toLocaleLowerCase("en-US");
      return (!status || booking.status === status) &&
        (!customerId || booking.customerId === customerId) &&
        (!sellerId || booking.creatorId === sellerId) &&
        (!from || day >= from) &&
        (!through || day <= through) &&
        searchText.includes(query);
    });
  }, [bookings, status, customerId, sellerId, from, through, search, names, creatorName]);

  return (
    <AdminFrame
      title="Monitor orders."
      description="Review booking lintas marketplace of store yang sama. Tampilan ini hanya-baca; perubahan status dilakukan oleh pihak yang bertransaksi."
    >
      <div className="ws-toolbar admin-orders-toolbar">
        <div className="field">
          <label htmlFor="admin-order-search">Search booking</label>
          <input id="admin-order-search" className="field__control" type="search" placeholder="Service, ID, Customer, atau Seller" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="admin-status">Status</label>
          <select id="admin-status" className="field__control" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All status</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="admin-customer">Customer</label>
          <select id="admin-customer" className="field__control" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">All Customer</option>
            {[...new Set(bookings.map((item) => item.customerId))].map((id) => <option key={id} value={id}>{names[id] || "Akun tidak dikenal"}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="admin-seller">Seller</label>
          <select id="admin-seller" className="field__control" value={sellerId} onChange={(event) => setSellerId(event.target.value)}>
            <option value="">All Seller</option>
            {sellerIds.map((id) => <option key={id} value={id}>{sellersById[id] || creatorName(id)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="admin-date-from">Dibuat sejak</label>
          <input id="admin-date-from" className="field__control" type="date" value={from} max={through || undefined} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="admin-date-through">Through tanggal</label>
          <input id="admin-date-through" className="field__control" type="date" value={through} min={from || undefined} onChange={(event) => setThrough(event.target.value)} />
        </div>
        <p aria-live="polite">{rows.length} of {bookings.length} booking</p>
      </div>
      <p className="ws-notice">Admin dapat memantau status saat ini. Riwayat perubahan status dan audit trail belum disimpan oleh model booking demo.</p>
      {error ? (
        <Empty title="Data booking belum tersedia.">Data could not be read. Check demo storage, then reload.</Empty>
      ) : !rows.length ? (
        <Empty title={bookings.length ? "Tidak ada booking yang cocok." : "Belum ada booking."}>
          {bookings.length ? "Ubah filter untuk melihat booking lain." : "Booking akan muncul saat Customer mengirim permintaan."}
        </Empty>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table admin-orders-table">
            <thead>
              <tr><th scope="col">Service</th><th scope="col">Customer</th><th scope="col">Seller</th><th scope="col">Status</th><th scope="col">Estimasi</th></tr>
            </thead>
            <tbody>
              {rows.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <strong>{booking.serviceTitle}</strong>
                    <small>{dateTime(booking.createdAt)}</small>
                    <details className="admin-booking-details">
                      <summary>Details booking</summary>
                      <dl>
                        <dt>ID booking</dt><dd>{booking.id}</dd>
                        <dt>Requested date</dt><dd>{booking.requestedDate || "Tidak ditentukan"}</dd>
                        <dt>Work mode</dt><dd>{booking.deliveryMode || "—"}</dd>
                        <dt>Lokasi</dt><dd>{booking.location || "Tidak ada lokasi onsite"}</dd>
                        <dt>Overview kebutuhan</dt><dd>{booking.requirements || "Tidak tersedia"}</dd>
                        <dt>Project description</dt><dd>{booking.description || "Tidak tersedia"}</dd>
                        <dt>Status saat ini</dt><dd>{booking.status}</dd>
                      </dl>
                    </details>
                  </td>
                  <td>{names[booking.customerId] || "Akun tidak dikenal"}</td>
                  <td>{creatorName(booking.creatorId)}</td>
                  <td><StatusBadge status={booking.status} /></td>
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

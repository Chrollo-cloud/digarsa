import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, Stat, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly, monthLabel } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { summarizeEarnings } from "./earnings";

export default function EarningsPage() {
  const { bookings, customers } = useSeller();
  const totals = summarizeEarnings(bookings);
  const history = [...bookings].sort((a, b) =>
    (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
  );
  return (
    <SellerFrame
      title="Pendapatan."
      description="Estimasi dari harga awal pada booking. Belum ada pembayaran, potongan, atau pencairan di Digarsa demo ini."
    >
      <div className="ws-stats">
        <Stat label="Selesai" value={money(totals.completed.total)} note={`${totals.completed.count} pesanan`} />
        <Stat label="Sedang dikerjakan" value={money(totals.inProgress.total)} note={`${totals.inProgress.count} pesanan`} />
        <Stat label="Menunggu respons" value={money(totals.pending.total)} note={`${totals.pending.count} permintaan`} />
        <Stat label="Ditolak / dibatalkan" value={totals.declined} note="Tidak dihitung sebagai pendapatan" />
      </div>

      <section className="ws-section" aria-labelledby="months-heading">
        <header>
          <h2 id="months-heading">Per bulan.</h2>
        </header>
        {totals.months.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th scope="col">Bulan</th>
                  <th scope="col">Pesanan selesai</th>
                  <th scope="col">Estimasi</th>
                </tr>
              </thead>
              <tbody>
                {totals.months.map((row) => (
                  <tr key={row.month}>
                    <td>{monthLabel(row.month)}</td>
                    <td>{row.count}</td>
                    <td>{money(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Belum ada pesanan selesai.">
            Estimasi muncul setelah kamu menandai pesanan sebagai selesai.
          </Empty>
        )}
      </section>

      <section className="ws-section" aria-labelledby="history-heading">
        <header>
          <h2 id="history-heading">Riwayat booking.</h2>
        </header>
        {history.length > 0 ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Layanan</th>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Status</th>
                  <th scope="col">Estimasi awal</th>
                </tr>
              </thead>
              <tbody>
                {history.map((booking) => (
                  <tr key={booking.id}>
                    <td>{dateOnly(booking.updatedAt || booking.createdAt)}</td>
                    <td><Link className="ws-link" to={`/seller-dashboard/orders/${booking.id}`}>{booking.serviceTitle}</Link></td>
                    <td>{customers[booking.customerId] || "Pelanggan"}</td>
                    <td><StatusBadge status={booking.status} /></td>
                    <td>{money(booking.estimatedPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Belum ada riwayat booking.">Booking akan muncul setelah pelanggan mengajukan layananmu.</Empty>
        )}
      </section>

      {totals.completed.rows.length > 0 && (
        <section className="ws-section" aria-labelledby="done-heading">
          <header>
            <h2 id="done-heading">Rincian estimasi selesai.</h2>
          </header>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th scope="col">Layanan</th>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Selesai</th>
                  <th scope="col">Estimasi</th>
                </tr>
              </thead>
              <tbody>
                {totals.completed.rows.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <Link className="ws-link" to={`/seller-dashboard/orders/${booking.id}`}>
                        {booking.serviceTitle}
                      </Link>
                    </td>
                    <td>{customers[booking.customerId] || "Pelanggan"}</td>
                    <td>{dateOnly(booking.updatedAt || booking.createdAt)}</td>
                    <td>{money(booking.estimatedPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </SellerFrame>
  );
}

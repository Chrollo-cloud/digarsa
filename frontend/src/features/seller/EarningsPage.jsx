import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, Stat } from "../workspace/WorkspaceFrame";
import { dateOnly, monthLabel } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { summarizeEarnings } from "./earnings";

export default function EarningsPage() {
  const { bookings, customers } = useSeller();
  const totals = summarizeEarnings(bookings);
  return (
    <SellerFrame
      title="Pendapatan."
      description="Estimasi dari harga awal pada booking. Belum ada pembayaran, potongan, atau pencairan di Digarsa demo ini."
    >
      <div className="ws-stats">
        <Stat label="Selesai" value={money(totals.completed.total)} note={`${totals.completed.count} pesanan`} />
        <Stat label="Sedang dikerjakan" value={money(totals.inProgress.total)} note={`${totals.inProgress.count} pesanan`} />
        <Stat label="Menunggu respons" value={money(totals.pending.total)} note={`${totals.pending.count} permintaan`} />
        <Stat label="Ditolak / dibatalkan" value={totals.declined} note="Tidak dihitung" />
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

      {totals.completed.rows.length > 0 && (
        <section className="ws-section" aria-labelledby="done-heading">
          <header>
            <h2 id="done-heading">Pesanan selesai.</h2>
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

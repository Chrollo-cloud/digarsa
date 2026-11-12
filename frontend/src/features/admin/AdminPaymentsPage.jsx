import { useMemo, useState } from "react";
import { money } from "../../data/marketplace";
import { PAYMENT_STATUSES, paymentStatusOf } from "../customer/paymentStatus";
import { getDigarsaCommission, getSellerNetEarnings } from "../seller/earnings";
import { Empty, Stat } from "../workspace/WorkspaceFrame";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminPaymentsPage() {
  const { bookings, accounts, creatorName } = useAdmin();
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const names = Object.fromEntries(accounts.map(row => [row.id, row.name]));
  const payments = bookings.filter(row => row.demoPayment || row.finalPrice !== undefined);
  const rows = useMemo(() => payments.filter(row => {
    const text = [row.demoPayment?.id || `DG-${row.id}`, names[row.customerId], creatorName(row.creatorId), row.serviceTitle].join(" ").toLowerCase();
    const date = (row.demoPayment?.paidAt || row.createdAt || "").slice(0, 10);
    return (!query || text.includes(query.toLowerCase())) && (!status || paymentStatusOf(row) === status) && (!from || date >= from) && (!to || date <= to);
  }), [payments, names, creatorName, query, status, from, to]);
  const paid = payments.filter(row => paymentStatusOf(row) === "Paid");
  const gross = paid.reduce((sum, row) => sum + row.finalPrice, 0);
  return <AdminFrame title="Payment monitoring." description="Simulated payment transactions from the shared booking store.">
    <div className="ws-stats"><Stat label="Total transactions" value={payments.length} /><Stat label="Paid payments" value={money(gross)} /><Stat label="Digarsa commission" value={money(getDigarsaCommission(gross))} /></div>
    <div className="ws-toolbar"><label className="field">Search transactions<input className="field__control" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ID, services, Customer, Seller" /></label>
      <label className="field">Status<select className="field__control" value={status} onChange={e => setStatus(e.target.value)}><option value="">All status</option>{PAYMENT_STATUSES.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="field">From<input className="field__control" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="field">Through<input className="field__control" type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    {!rows.length ? <Empty title="No matching transactions.">Transactions appear after a booking has a final price.</Empty> : <div className="ws-table-wrap"><table className="ws-table admin-payment-table"><thead><tr><th>ID pembayaran</th><th>Customer</th><th>Seller</th><th>Service</th><th>Total</th><th>Komisi</th><th>Seller net</th><th>Metode</th><th>Status</th><th>Tanggal</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.demoPayment?.id || `DG-${row.id}`}</td><td>{names[row.customerId] || "Customer"}</td><td>{creatorName(row.creatorId)}</td><td><details><summary>{row.serviceTitle}</summary><p>Booking {row.id}</p><p>Harga akhir: {money(row.finalPrice || 0)}</p></details></td><td>{money(row.finalPrice || 0)}</td><td>{money(paymentStatusOf(row) === "Paid" ? getDigarsaCommission(row.finalPrice) : 0)}</td><td>{money(paymentStatusOf(row) === "Paid" ? getSellerNetEarnings(row.finalPrice) : 0)}</td><td>QRIS demo</td><td>{paymentStatusOf(row)}</td><td>{new Date(row.demoPayment?.paidAt || row.createdAt).toLocaleString("en-US")}</td></tr>)}</tbody></table></div>}
  </AdminFrame>;
}

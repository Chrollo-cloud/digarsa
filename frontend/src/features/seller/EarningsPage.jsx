import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, Stat } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { getAvailableBalance, getDigarsaCommission, getEarningsHistory, getGrossEarnings, getPendingBalance, getSellerNetEarnings, getTotalPayout } from "./earnings";
import { payoutStore } from "./payoutStore";

export default function EarningsPage() {
  const { profile, bookings, customers } = useSeller();
  const payouts = profile ? payoutStore.list(profile.id) : [];
  const history = getEarningsHistory(bookings);
  return <SellerFrame title="Earnings." description="Earnings are calculated from demo payments. Sellers receive 95%; Digarsa's commission is 5%.">
    <div className="ws-stats">
      <Stat label="Available balance" value={money(getAvailableBalance(bookings, payouts))} note="Paid dan pekerjaan selesai" />
      <Stat label="Pending balance" value={money(getPendingBalance(bookings))} note="Paid, menunggu pekerjaan selesai" />
      <Stat label="Total earnings" value={money(getSellerNetEarnings(bookings))} note="Setelah komisi" />
      <Stat label="Total payouts" value={money(getTotalPayout(payouts))} note="Payout berstatus Paid Out" />
      <Stat label="Gross earnings" value={money(getGrossEarnings(bookings))} note="Payment total Paid" />
      <Stat label="Digarsa commission" value={money(getDigarsaCommission(bookings))} note="5% of gross" />
    </div>
    <section className="ws-section"><header><h2>Earnings history.</h2><Link to="/seller-dashboard/wallet">Open wallet </Link></header>
      {!history.length ? <Empty title="No earnings yet." >Paid transactions appear here. Accepted or Completed bookings without payment are excluded.</Empty> : <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>Payment date</th><th>Service</th><th>Customer</th><th>Gross</th><th>Komisi 5%</th><th>Seller 95%</th></tr></thead><tbody>{history.map(row => <tr key={row.demoPayment?.id || row.id}><td>{new Date(row.paidAt).toLocaleString("en-US")}</td><td>{row.serviceTitle}</td><td>{customers[row.customerId] || "Customer"}</td><td>{money(row.gross)}</td><td>{money(row.commission)}</td><td>{money(row.net)}</td></tr>)}</tbody></table></div>}
    </section>
  </SellerFrame>;
}

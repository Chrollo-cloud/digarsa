import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { payoutStore } from "./payoutStore";
import { getAvailableBalance, getPendingBalance, getSellerNetEarnings, getTotalPayout } from "./earnings";
import { Stat } from "../workspace/WorkspaceFrame";

export default function WalletPage() {
  const { profile, bookings } = useSeller();
  const sellerId = profile?.id;
  const payouts = sellerId ? payoutStore.list(sellerId) : [];
  const accounts = sellerId ? payoutStore.listAccounts(sellerId) : [];
  return <SellerFrame title="Wallet." description="Overview of demo balances from paid bookings and work status.">
    <div className="ws-stats">
      <Stat label="Available balance" value={money(getAvailableBalance(bookings, payouts))} note="From completed orders" />
      <Stat label="Pending balance" value={money(getPendingBalance(bookings))} note="Pending pekerjaan selesai" />
      <Stat label="Total earnings" value={money(getSellerNetEarnings(bookings))} note="After Digarsa's 5% commission" />
      <Stat label="Total payouts" value={money(getTotalPayout(payouts))} note="Marked Paid Out" />
    </div>
    <section className="ws-section"><header><h2>Demo bank account.</h2></header>
      {accounts.length ? <ul className="ws-list">{accounts.map(account => <li className="ws-row" key={account.id}><div><strong>{account.bankName}</strong><p>{account.accountName} · {account.accountNumber}</p></div></li>)}</ul> : <p>No bank accounts saved yet.</p>}
      <div className="seller-quick-links"><Link className="button button--primary" to="/seller-dashboard/withdraw">Withdraw </Link><Link className="button button--secondary" to="/seller-dashboard/payout-history">Payout history</Link></div>
    </section>
  </SellerFrame>;
}

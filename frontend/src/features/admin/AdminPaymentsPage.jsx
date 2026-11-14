import AdminFrame from "./AdminFrame";

export default function AdminPaymentsPage() {
  return <AdminFrame title="Payment monitoring unavailable." description="No payment gateway or admin payment API is connected.">
    <section className="ws-panel" role="status"><span className="ws-kicker">NOT CONNECTED</span><h2>No payment transactions to display.</h2><p>The previous demo-only payment dashboard is disabled. Payment status, commission, refunds, wallet balances, and payouts must come from a trusted backend finance implementation.</p></section>
  </AdminFrame>;
}

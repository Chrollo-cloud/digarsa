import AdminFrame from "./AdminFrame";

export default function AdminPayoutsPage() {
  return <AdminFrame title="Payout monitoring unavailable." description="Payout state is not connected to a verified backend finance API.">
    <section className="ws-panel" role="status"><span className="ws-kicker">NOT CONNECTED</span><h2>No payout actions are available.</h2><p>The demo payout queue and status controls are disabled. Admin actions must not mark funds as paid out or change payment state.</p></section>
  </AdminFrame>;
}

import AdminFrame from "./AdminFrame";

export default function AdminOrdersPage() {
  return <AdminFrame title="Booking monitor unavailable." description="There is no verified admin booking-list endpoint in the current backend contract.">
    <section className="ws-panel" role="status"><span className="ws-kicker">SERVER CONTRACT REQUIRED</span><h2>Demo bookings are not shown here.</h2><p>Customer and seller booking pages use their authenticated backend endpoints. Admin dispute and cancellation routes remain separate; this screen does not invent an all-bookings endpoint.</p></section>
  </AdminFrame>;
}

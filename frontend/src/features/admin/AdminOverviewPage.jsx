import { Link } from "react-router-dom";
import AdminFrame from "./AdminFrame";

export default function AdminOverviewPage() {
  return <AdminFrame title="Admin Dashboard." description="Booking and finance monitoring only appear when a verified admin API contract is available.">
    <section className="ws-panel" role="status"><span className="ws-kicker">BOOKING DATA NOT CONNECTED</span><h2>Demo booking metrics are hidden.</h2><p>The backend provides case-specific dispute and cancellation routes, but no all-bookings admin listing or finance dashboard contract. This screen does not use local demo booking/payment state.</p><div className="seller-quick-links"><Link className="button button--secondary" to="/admin/orders">Booking monitor</Link><Link className="button button--secondary" to="/admin/payments">Payment monitoring</Link></div></section>
  </AdminFrame>;
}

import SellerFrame from "./SellerFrame";
import { Link } from "react-router-dom";

export default function UnsupportedFinancePage({ title = "Finance actions unavailable." }) {
  return <SellerFrame title={title} description="Payment and payout operations are not connected to the backend." serverBacked>
    <section className="ws-panel" role="status">
      <span className="ws-kicker">NOT CONNECTED</span>
      <h2>No balance or transfer is available.</h2>
      <p>This workspace does not calculate earnings from demo bookings, store bank destinations, request withdrawals, or report payouts. A verified finance API is required before these actions can be enabled.</p>
      <Link className="ws-link" to="/seller-dashboard/orders">Return to bookings</Link>
    </section>
  </SellerFrame>;
}

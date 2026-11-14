import { Link } from "react-router-dom";
import CustomerFrame from "./CustomerFrame";
import "./checkout.css";

export default function PaymentPage() {
  return <CustomerFrame serverBacked title="Payment is unavailable." description="The demo payment screen is disabled." serverBackedNotice="This screen cannot start or confirm a payment.">
    <section className="checkout-seller" role="status">
      <span className="market-kicker">NO PAYMENT ACTION TAKEN</span>
      <h2>Payment must be confirmed by a trusted backend integration.</h2>
      <p>This release does not connect to QRIS or a payment gateway. No payment was created, and this screen cannot change booking status.</p>
      <Link className="button button--primary" to="/orders">View bookings</Link>
    </section>
  </CustomerFrame>;
}

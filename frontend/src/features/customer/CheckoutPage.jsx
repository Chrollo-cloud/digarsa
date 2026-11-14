import { Link } from "react-router-dom";
import CustomerFrame from "./CustomerFrame";
import "./checkout.css";

export default function CheckoutPage() {
  return <CustomerFrame serverBacked title="Checkout is unavailable." description="Booking requests are available; payment is not part of this integration." serverBackedNotice="No payment was started or recorded.">
    <section className="checkout-seller" role="status">
      <span className="market-kicker">PAYMENT NOT CONNECTED</span>
      <h2>Your cart does not create a booking.</h2>
      <p>Digarsa has no trusted payment confirmation flow in this release. We have disabled checkout and will not simulate a payment or mark an order as paid.</p>
      <p>Open an available service and submit a booking request without payment.</p>
      <div className="checkout-row-actions"><Link className="button button--primary" to="/marketplace">Browse services</Link><Link className="button button--secondary" to="/cart">Back to cart</Link></div>
    </section>
  </CustomerFrame>;
}

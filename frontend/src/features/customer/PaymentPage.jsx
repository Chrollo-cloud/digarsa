import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money } from "../../data/marketplace";
import { messagingStore } from "../messaging/messagingClient";
import { useCustomer } from "./useCustomer";
import { validPrice } from "./customerStore";
import { paymentStatusOf, paymentStatusInfo } from "./paymentStatus";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import "./checkout.css";

function formatRemaining(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function PaymentPage() {
  const { user } = useCustomer();
  const { bookingId } = useParams();
  return <PaymentForm key={`${user.id}-${bookingId}`} bookingId={bookingId} />;
}

function PaymentForm({ bookingId }) {
  const { user, bookings, store, error: storageError } = useCustomer();
  const [latestBooking, setLatestBooking] = useState(null);
  const booking = latestBooking || bookings.find(row => row.id === bookingId);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [remaining, setRemaining] = useState(30 * 60 * 1000);
  const locked = useRef(false);
  const enabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_PAYMENT === "true";
  const status = booking ? paymentStatusOf(booking) : "Unpaid";
  const statusInfo = paymentStatusInfo(status);
  const paid = status === "Paid";
  const eligible = booking?.status === "Accepted" && validPrice(booking.finalPrice);
  const deadlineAt = booking ? Date.parse(booking.createdAt) + 30 * 60 * 1000 : 0;

  useEffect(() => {
    if (!deadlineAt || paid) return undefined;
    const update = () => setRemaining(Math.max(0, deadlineAt - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt, paid]);

  if (!booking) return <CustomerFrame title="Demo payment."><EmptyState title="This order is unavailable to your account." to="/orders" label="Back to orders" /></CustomerFrame>;

  function notify() {
    try { messagingStore.notifyBookingEvent(bookingId); setWarning(""); }
    catch { setWarning("The status was saved, but the simulation notification could not be sent."); }
  }
  function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    try {
      const result = store.simulatePayment(bookingId, {
        expectedUserId: user.id,
        confirmed,
        expectedFinalPrice: booking.finalPrice,
      });
      setLatestBooking(result);
      setError("");
      notify();
    } catch (failure) { setError(failure.message); }
    finally { locked.current = false; }
  }
  function checkStatus() {
    try {
      setLatestBooking(store.getBooking(bookingId));
      setCheckedAt(new Date().toLocaleString("en-US"));
      setError("");
    } catch (failure) { setError(failure.message); }
  }

  const transactionId = booking.demoPayment?.id || `DG-${booking.id}`;
  return <CustomerFrame title={paid ? "Payment simulation recorded." : "Order payment"}
    description="Digarsa demo payment — QRIS is for illustration only; no money moves.">
    <Link className="customer-back" to={`/orders/${bookingId}`}>← Back to order details</Link>
    <div className="checkout-layout">
      <section className="checkout-seller">
        <span className="market-kicker">DEMO / NOT A REAL TRANSACTION</span>
        <h2>{booking.serviceTitle}</h2>
        <p>Customer: {user.name}</p>
        <p>Seller: {booking.creatorName}</p>
        <p className="checkout-reference">Demo transaction ID: {transactionId}</p>
        <div className={`payment-status payment-status--${statusInfo.tone}`} role="status">
          <strong>{statusInfo.label}</strong><span>{statusInfo.description}</span>
        </div>
        {paid ? <div role="status">
          <h3>Payment simulated.</h3>
          <p>No money was sent. The seller may continue work after the demo payment is recorded.</p>
          {booking.demoPayment?.paidAt && <p>Payment time: {new Date(booking.demoPayment.paidAt).toLocaleString("en-US")}</p>}
          <Link className="button button--primary" to={`/orders/${bookingId}`}>Track order</Link>
        </div> : !eligible ? <p role="status">Payment simulation is available after the seller accepts and confirms the final price.</p>
          : !enabled ? <p role="status">Payment simulation is disabled in this environment. No payment was processed.</p>
            : <>
              <div className="payment-method">
                <span className="market-kicker">PAYMENT METHOD</span>
                <div className="payment-method__choice"><strong>QRIS</strong><span>DEMO ILLUSTRATION</span></div>
                <div className="qris-demo" aria-label="Ilustrasi QRIS demo, bukan kode pembayaran aktif">
                  <strong>QRIS</strong><span>DEMO</span><small>NOT AN ACTIVE PAYMENT CODE</small>
                </div>
                <p>This is an illustration, not an active payment QR code. No real money changes hands.</p>
                <p role="timer" aria-label="Sisa waktu simulasi">Demo time remaining: {formatRemaining(remaining)}</p>
              </div>
              <form onSubmit={submit}>
                <label className="checkout-consent"><input type="checkbox" checked={confirmed} required
                  onChange={event => setConfirmed(event.target.checked)} />I understand and want to run a simulation without real money.</label>
                <button type="submit" className="button button--primary" disabled={!confirmed || !!storageError}>Simulate payment</button>
              </form>
            </>}
        {error && <p className="customer-warning" role="alert">{error}</p>}
        {warning && <p className="customer-warning" role="alert">{warning}<button type="button" className="location-link" onClick={notify}>Retry notification</button></p>}
        <button type="button" className="button button--secondary" onClick={checkStatus}>Check payment status</button>
        {checkedAt && <p role="status">Status refreshed from the store at {checkedAt}.</p>}
      </section>
      <aside className="checkout-summary">
        <span className="market-kicker">DEMO SUMMARY</span><h2>Transaction details</h2>
        <dl>
          <div><dt>Service</dt><dd>{booking.serviceTitle}</dd></div>
          <div><dt>Payment total</dt><dd>{validPrice(booking.finalPrice) ? money(booking.finalPrice) : "Not confirmed"}</dd></div>
          <div><dt>Method</dt><dd>Demo QRIS (illustration)</dd></div>
          <div><dt>Status</dt><dd>{statusInfo.label}</dd></div>
          {paid && booking.demoPayment?.paidAt && <div><dt>Paid at</dt><dd>{new Date(booking.demoPayment.paidAt).toLocaleString("en-US")}</dd></div>}
        </dl>
        <p>In production, payment status must come from trusted backend confirmation. Demo data is not proof of payment.</p>
      </aside>
    </div>
  </CustomerFrame>;
}

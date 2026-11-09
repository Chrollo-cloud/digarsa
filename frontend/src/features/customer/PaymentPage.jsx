import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money } from "../../data/marketplace";
import { messagingStore } from "../messaging/messagingClient";
import { useCustomer } from "./useCustomer";
import { validPrice } from "./customerStore";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import "./checkout.css";

export default function PaymentPage() {
  const { user } = useCustomer();
  const { bookingId } = useParams();
  return <PaymentForm key={`${user.id}-${bookingId}`} bookingId={bookingId} />;
}
function PaymentForm({ bookingId }) {
  const { user, bookings, store, error: storageError } = useCustomer();
  const booking = bookings.find(row => row.id === bookingId);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const locked = useRef(false);
  const enabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_PAYMENT === "true";
  if (!booking) return <CustomerFrame title="Pembayaran demo."><EmptyState title="Pesanan tidak tersedia untuk akunmu." to="/orders" label="Kembali ke pesanan" /></CustomerFrame>;
  const paid = ["Paid", "Completed"].includes(booking.status) && booking.demoPayment?.kind === "simulation";
  const eligible = booking.status === "Accepted" && validPrice(booking.finalPrice);
  function notify() {
    try { messagingStore.notifyBookingEvent(bookingId); setWarning(""); }
    catch { setWarning("Status tersimpan, tetapi notifikasi simulasi belum dapat dikirim."); }
  }
  function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    try {
      store.simulatePayment(bookingId, { expectedUserId: user.id, confirmed, expectedFinalPrice: booking.finalPrice });
      setError("");
      notify();
    } catch (failure) { setError(failure.message); }
    finally { locked.current = false; }
  }
  return <CustomerFrame title={paid ? "Simulasi tercatat." : "Siap melanjutkan ide?"}
    description="Pembayaran demo Digarsa — tanpa kartu, rekening, atau perpindahan uang.">
    <Link className="customer-back" to={`/orders/${bookingId}`}>← Detail pesanan</Link>
    <div className="checkout-layout">
      <section className="checkout-seller">
        <span className="market-kicker">SIMULASI / BUKAN TRANSAKSI NYATA</span>
        <h2>{booking.serviceTitle}</h2>
        <p>Seller: {booking.creatorName}</p><p className="checkout-reference">Referensi: {booking.id}</p>
        {paid ? <div role="status">
          <h3>Pembayaran disimulasikan.</h3>
          <p>Tidak ada uang dikirim. Seller kini dapat menyelesaikan pekerjaan ini setelah hasil diserahkan.</p>
          <p className="checkout-reference">Referensi demo: {booking.demoPayment.id}</p>
          <Link className="button button--primary" to={`/orders/${bookingId}`}>Lacak pesanan →</Link>
        </div> : !eligible ? <p role="status">Simulasi hanya tersedia setelah Seller menerima dan mengonfirmasi harga akhir. Pesanan lama tanpa harga akhir perlu dikonfirmasi oleh Seller.</p>
          : !enabled ? <p role="status">Simulasi tidak diaktifkan pada lingkungan ini. Tidak ada pembayaran yang diproses.</p>
            : <form onSubmit={submit}>
              <p>Dengan tindakan ini, status pesanan demo berubah dari Diterima Seller menjadi Sudah Dibayar. Ini bukan konfirmasi bank atau otorisasi pembayaran produksi.</p>
              <label className="checkout-consent"><input type="checkbox" checked={confirmed} required
                onChange={event => setConfirmed(event.target.checked)} />Saya memahami dan ingin menjalankan simulasi tanpa uang nyata.</label>
              <button type="submit" className="button button--primary" disabled={!confirmed || !!storageError}>Simulasikan Pembayaran</button>
            </form>}
        {error && <p className="customer-warning" role="alert">{error}</p>}
        {warning && <p className="customer-warning" role="alert">{warning}
          <button type="button" className="location-link" onClick={notify}>Coba lagi notifikasi</button></p>}
      </section>
      <aside className="checkout-summary">
        <span className="market-kicker">RINGKASAN DEMO</span><h2>Harga disepakati.</h2>
        <dl><div><dt>Harga akhir Seller</dt><dd>{validPrice(booking.finalPrice) ? money(booking.finalPrice) : "Belum dikonfirmasi"}</dd></div>
          <div><dt>Biaya platform</dt><dd>Tidak diterapkan</dd></div>
          <div><dt>Total simulasi</dt><dd>{validPrice(booking.finalPrice) ? money(booking.finalPrice) : "—"}</dd></div></dl>
        <p>Di produksi, status pembayaran harus berasal dari konfirmasi backend tepercaya. Data browser demo bukan bukti pembayaran.</p>
      </aside>
    </div>
  </CustomerFrame>;
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCreator, money, services } from "../../data/marketplace";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";

const qrDemo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210"><rect width="210" height="210" rx="12" fill="white"/><text x="105" y="18" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#24375f">DIGARSA DEMO</text><path fill="#24375f" d="M20 25h60v60H20zm10 10v40h40V35zm10 10h20v20H40zm70-20h60v60h-60zm10 10v40h40V35zm10 10h20v20h-20zM20 115h60v60H20zm10 10v40h40v-40zm10 10h20v20H40zm70-10h20v20h-20zm30 0h20v20h-20zm-30 30h20v20h-20zm30-10h30v30h-30zm40-20h20v20h-20zm-10 40h30v20h-30z"/><text x="105" y="204" text-anchor="middle" font-family="Arial" font-size="10" fill="#607084">HANYA UNTUK SIMULASI</text></svg>')}`;
const bankInfo = {
  BCA: "0001234567",
  BRI: "0002345678",
  BNI: "0003456789",
  Mandiri: "0004567890",
};

export default function PaymentSummaryPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user, bookings, store } = useCustomer();
  const booking = bookings.find((item) => item.id === bookingId);
  const service = booking && services.find((item) => item.id === booking.serviceId);
  const creator = booking && getCreator(booking.creatorId);
  const [method, setMethod] = useState("BCA");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  if (!booking || booking.status !== "Accepted")
    return <CustomerFrame title="Pembayaran belum tersedia."><EmptyState title="Seller belum menerima booking ini.">Pembayaran hanya terbuka untuk booking berstatus Accepted.<Link to={booking ? `/orders/${booking.id}` : "/orders"}>Kembali ke pesanan ↗</Link></EmptyState></CustomerFrame>;

  const finalPrice = booking.finalPrice ?? booking.estimatedPrice;
  const canStart = ["Unpaid", "Failed", "Expired"].includes(booking.paymentStatus);

  function begin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      store.beginPayment(booking.id, method, { expectedUserId: user.id });
    } catch (failure) {
      setError(failure.message || "Pembayaran belum dapat dimulai.");
    }
  }
  function settle(succeeded) {
    setError("");
    try {
      store.simulatePayment(booking.id, succeeded, { expectedUserId: user.id });
      if (succeeded) navigate(`/orders/${booking.id}?paid=1`, { replace: true });
      else setMessage("Simulasi pembayaran gagal. Booking tetap Accepted dan kamu dapat mencoba kembali.");
    } catch (failure) {
      setError(failure.message || "Hasil pembayaran belum dapat disimpan.");
    }
  }
  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(bankInfo[booking.paymentMethod || method]);
      setCopied(true);
      setError("");
    } catch {
      setCopied(false);
      setError("Nomor rekening tidak dapat disalin di browser ini.");
    }
  }

  return (
    <CustomerFrame title="Ringkasan pembayaran." description="Pembayaran simulasi hanya tersedia setelah Seller menerima booking. Tidak ada payment gateway sungguhan yang dihubungkan.">
      <Link className="customer-back" to={`/orders/${booking.id}`}>← Kembali ke detail pesanan</Link>
      {error && <p className="customer-warning" role="alert">{error}</p>}
      {message && <p className="customer-success" role="status">{message}</p>}
      <div className="customer-payment-layout">
        <section className="customer-payment-card">
          {service?.image && <img className="customer-payment-image" src={service.image} alt={service.alt || service.title} />}
          <span className="market-kicker">BOOKING ACCEPTED</span>
          <h2>{booking.serviceTitle}</h2>
          <p>Seller: {creator?.name || booking.creatorName}</p>
          <dl>
            <dt>Booking ID</dt><dd>{booking.id}</dd>
            <dt>Harga final</dt><dd>{money(finalPrice)}</dd>
            <dt>Biaya tambahan</dt><dd>{money(0)}</dd>
            <dt>Total</dt><dd><strong>{money(finalPrice)}</strong></dd>
            <dt>Status pesanan</dt><dd>{booking.status}</dd>
            <dt>Status pembayaran</dt><dd>{booking.paymentStatus}</dd>
            <dt>Jadwal</dt><dd>{booking.requestedDate || "Fleksibel"}</dd>
          </dl>
          <h3>Kebutuhan proyek</h3><p className="customer-preline">{booking.requirements}</p>
          {booking.additionalInfo && <><h3>Informasi tambahan</h3><p className="customer-preline">{booking.additionalInfo}</p></>}
        </section>
        <section className="customer-payment-card">
          <span className="market-kicker">METODE PEMBAYARAN DEMO</span>
          {canStart ? (
            <form onSubmit={begin}>
              <label className="field">Pilih metode
                <select className="field__control" value={method} onChange={(event) => setMethod(event.target.value)}>
                  {Object.keys(bankInfo).map((bank) => <option key={bank} value={bank}>Transfer {bank}</option>)}
                  <option value="QRIS">QRIS</option>
                </select>
              </label>
              <button className="button button--primary" type="submit">Mulai pembayaran ↗</button>
              {booking.paymentStatus === "Failed" && <p>Pembayaran sebelumnya gagal. Kamu dapat mengulang tanpa membuat booking baru.</p>}
            </form>
          ) : booking.paymentStatus === "Pending" ? (
            <>
              <p role="status">Pembayaran Pending · {booking.paymentMethod || method} · {money(finalPrice)}</p>
              {booking.paymentMethod === "QRIS" ? <img className="customer-qris-demo" src={qrDemo} alt="QRIS demo simulasi, bukan kode pembayaran sungguhan" /> : <div className="customer-bank-demo"><strong>{booking.paymentMethod} · Digarsa Demo</strong><span>{bankInfo[booking.paymentMethod] || bankInfo.BCA}</span><button type="button" className="button button--secondary" onClick={copyAccount}>{copied ? "Nomor disalin" : "Salin nomor rekening"}</button></div>}
              <p>Nomor dan QR ini hanya contoh untuk simulasi. Jangan transfer uang sungguhan.</p>
              <div className="customer-confirm-actions">
                <button type="button" className="button button--primary" onClick={() => settle(true)}>Simulasikan berhasil</button>
                <button type="button" className="button button--secondary" onClick={() => settle(false)}>Simulasikan gagal</button>
              </div>
            </>
          ) : (
            <p>Pembayaran tercatat {booking.paymentStatus}. <Link to={`/orders/${booking.id}`}>Lihat status pesanan ↗</Link></p>
          )}
          <small>Simulasi lokal untuk pengujian. Tidak membuat transaksi nyata, bukti transfer, atau konfirmasi dari bank.</small>
        </section>
      </div>
    </CustomerFrame>
  );
}

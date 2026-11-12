import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCreator, money, services } from "../../data/marketplace";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";

export default function PaymentSummaryPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user, bookings, store } = useCustomer();
  const booking = bookings.find((item) => item.id === bookingId);
  const service = booking && services.find((item) => item.id === booking.serviceId);
  const creator = booking && getCreator(booking.creatorId);
  const method = "QRIS";
  const [error, setError] = useState("");

  if (!booking || booking.status !== "Accepted")
    return <CustomerFrame title="Pembayaran belum tersedia."><EmptyState title="Seller belum menerima booking ini.">Pembayaran hanya terbuka untuk booking berstatus Accepted.<Link to={booking ? `/orders/${booking.id}` : "/orders"}>Kembali ke pesanan ↗</Link></EmptyState></CustomerFrame>;

  const finalPrice = booking.finalPrice ?? booking.estimatedPrice;
  const canStart = ["Unpaid", "Failed", "Expired"].includes(booking.paymentStatus);

  function begin(event) {
    event.preventDefault();
    setError("");
    try {
      store.beginPayment(booking.id, method, { expectedUserId: user.id });
      navigate(`/payment/${booking.id}`);
    } catch (failure) {
      setError(failure.message || "Pembayaran belum dapat dimulai.");
    }
  }
  return (
    <CustomerFrame title="Ringkasan pembayaran." description="Pembayaran QRIS-only untuk demo. QR yang ditampilkan adalah ilustrasi dan tidak terhubung ke payment gateway atau transaksi sungguhan.">
      <Link className="customer-back" to={`/orders/${booking.id}`}>← Kembali ke detail pesanan</Link>
      {error && <p className="customer-warning" role="alert">{error}</p>}
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
              <div className="customer-payment-method">
                <strong>QRIS</strong>
                <span>Satu-satunya metode pembayaran demo Digarsa.</span>
              </div>
              <button className="button button--primary" type="submit">Lanjutkan dengan QRIS ↗</button>
              {booking.paymentStatus === "Failed" && <p>Pembayaran sebelumnya gagal. Kamu dapat mengulang tanpa membuat booking baru.</p>}
            </form>
          ) : booking.paymentStatus === "Pending" ? (
            <>
              <p role="status">Pembayaran demo Pending · {booking.paymentMethod || method} · {money(finalPrice)}</p>
              <p>Lanjutkan ke layar simulasi dengan persetujuan eksplisit. Tidak ada pembayaran nyata.</p>
              <Link className="button button--primary" to={`/payment/${booking.id}`}>Lanjut ke simulasi ↗</Link>
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

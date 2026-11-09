import { bookingStatusLabel } from "./bookingLifecycle";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import ContactCreator from "../messaging/ContactCreator";
import BookingReviewAction from "../reviews/BookingReviewAction";
import { money } from "../../data/marketplace";
import { useCustomer } from "./useCustomer";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { bookingDate, customerDeclineReason } from "./formatters";

import {
  bookingLifecycle as lifecycle,
  bookingStatusDescription,
} from "./bookingLifecycle";
export default function BookingDetailPage() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { user, bookings } = useCustomer();
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking)
    return (
      <CustomerFrame title="Pesanan tidak ditemukan.">
        <EmptyState
          title="Pesanan ini tidak tersedia untuk akunmu."
          to="/orders"
          label="Lihat pesanan saya"
        >
          Periksa alamat atau masuk dengan akun pemilik permintaan.
        </EmptyState>
      </CustomerFrame>
    );
  const declineReason = customerDeclineReason(booking, user?.id);
  const terminal = ["Declined", "Cancelled"].includes(booking.status);
  return (
    <CustomerFrame
      title="Perjalanan kolaborasimu."
      description="Ikuti status permintaan tanpa kehilangan detail penting."
    >
      {booking.status === "Requested" && params.has("submitted") && (
        <p role="status" className="customer-success">
          Permintaan tersimpan. Menunggu tinjauan kreator; belum ada pembayaran.
        </p>
      )}
      {location.state?.notificationWarning && (
        <p className="customer-warning" role="alert">
          Permintaan tersimpan, tetapi notifikasi belum dapat disimpan. Pesanan
          tetap tersedia di pesananmu.
        </p>
      )}
      <article className="customer-tracking">
        <header>
          <span
            className={`customer-status status-${booking.status.toLowerCase()}`}
          >
            {bookingStatusLabel(booking.status)}
          </span>
          <h2>{booking.serviceTitle}</h2>
          <p>
            {booking.creatorName} · ID {booking.id}
          </p>
        </header>
        <ol className="customer-timeline" aria-label="Tahapan pesanan">
          {lifecycle.map((step, index) => (
            <li
              key={step}
              className={
                !terminal && index <= lifecycle.indexOf(booking.status)
                  ? "is-reached"
                  : ""
              }
              aria-current={booking.status === step ? "step" : undefined}
            >
              <span>{index + 1}</span>
              <strong>{bookingStatusLabel(step)}</strong>
            </li>
          ))}
        </ol>
        {terminal && (
          <p className="customer-warning">
            Permintaan{" "}
            {booking.status === "Declined" ? "ditolak" : "dibatalkan"}. Alur
            kolaborasi telah berhenti.
            {declineReason && (
              <span className="customer-preline">
                {" "}Alasan penolakan: {declineReason}
              </span>
            )}
          </p>
        )}
        <dl className="customer-tracking-facts">
          <div>
            <dt>Kreator</dt>
            <dd>
              <Link to={`/seller/${booking.creatorId}`}>
                {booking.creatorName} ↗
              </Link>
            </dd>
          </div>
          <div>
            <dt>Estimasi harga awal</dt>
            <dd>{money(booking.estimatedPrice)}</dd>
          </div>
          {Number.isSafeInteger(booking.finalPrice) && <div><dt>Harga akhir Seller</dt><dd>{money(booking.finalPrice)}</dd></div>}
          <div>
            <dt>Mode pengerjaan</dt>
            <dd>{booking.deliveryMode === "onsite" ? "Di lokasi" : "Daring"}</dd>
          </div>
          <div>
            <dt>Tanggal diminta</dt>
            <dd>{bookingDate(booking.requestedDate)}</dd>
          </div>
          <div>
            <dt>Dikirim</dt>
            <dd>{new Date(booking.createdAt).toLocaleString("id-ID")}</dd>
          </div>
          {booking.location && (
            <div>
              <dt>Lokasi proyek</dt>
              <dd>{booking.location}</dd>
            </div>
          )}
        </dl>
        <h3>Kebutuhan proyek</h3>
        <p className="customer-preline">{booking.requirements}</p>
        <h3>Deskripsi proyek</h3>
        <p className="customer-preline">{booking.description}</p>
        <p className="customer-info">
          {bookingStatusDescription(booking.status)}
        </p>
        {booking.demoPayment?.kind === "simulation" && <p className="customer-info">Pembayaran disimulasikan. Tidak ada uang dipindahkan.</p>}
        {booking.status === "Accepted" && Number.isSafeInteger(booking.finalPrice) &&
          <Link className="button button--primary" to={`/payment/${booking.id}`}>Pembayaran demo →</Link>}
        <Link to={`/service/${booking.serviceId}`}>Lihat layanan ↗</Link>
        {booking.status === "Completed" && (
          <BookingReviewAction bookingId={booking.id} />
        )}
        <ContactCreator
          key={booking.id}
          sellerProfileId={booking.creatorId}
          serviceId={booking.serviceId}
          bookingId={booking.id}
        />
      </article>
    </CustomerFrame>
  );
}

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
import { bookingDate } from "./formatters";

import {
  bookingLifecycle as lifecycle,
  bookingStatusDescription,
} from "./bookingLifecycle";
export default function BookingDetailPage() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { bookings } = useCustomer();
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking)
    return (
      <CustomerFrame title="Booking tidak ditemukan.">
        <EmptyState
          title="Booking ini tidak tersedia untuk akunmu."
          to="/orders"
          label="Lihat pesanan saya"
        >
          Periksa alamat atau masuk dengan akun pemilik permintaan.
        </EmptyState>
      </CustomerFrame>
    );
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
          Permintaan tersimpan, tetapi notifikasi belum dapat disimpan. Booking
          tetap tersedia di pesananmu.
        </p>
      )}
      <article className="customer-tracking">
        <header>
          <span
            className={`customer-status status-${booking.status.toLowerCase()}`}
          >
            {booking.status}
          </span>
          <h2>{booking.serviceTitle}</h2>
          <p>
            {booking.creatorName} · ID {booking.id}
          </p>
        </header>
        <ol className="customer-timeline" aria-label="Tahapan booking">
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
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        {terminal && (
          <p className="customer-warning">
            Permintaan{" "}
            {booking.status === "Declined" ? "ditolak" : "dibatalkan"}. Alur
            kolaborasi telah berhenti.
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
          <div>
            <dt>Mode pengerjaan</dt>
            <dd>{booking.deliveryMode === "onsite" ? "Onsite" : "Remote"}</dd>
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

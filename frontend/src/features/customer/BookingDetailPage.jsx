import { useState } from "react";
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
import { publicUrl } from "../../utils/publicUrl";
import { useCustomer } from "./useCustomer";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { bookingDate, customerDeclineReason } from "./formatters";
import { paymentStatusOf, paymentStatusInfo } from "./paymentStatus";

import {
  bookingLifecycle as lifecycle,
  bookingStatusDescription,
} from "./bookingLifecycle";
export default function BookingDetailsPage() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
 const { user, bookings, store } = useCustomer();

const [revisionNote, setRevisionNote] = useState("");
const [showRevision, setShowRevision] = useState(false);
const [actionError, setActionError] = useState("");
const [actionSuccess, setActionSuccess] = useState("");
  const booking = bookings.find((item) => item.id === bookingId);
  if (!booking)
    return (
      <CustomerFrame title="Order not found.">
        <EmptyState
          title="This order is not available to your account."
          to="/orders"
          label="View my orders"
        >
          Check the address or sign in with the account that made the request.
        </EmptyState>
      </CustomerFrame>
    );
  const declineReason = customerDeclineReason(booking, user?.id);
  const paymentInfo = paymentStatusInfo(paymentStatusOf(booking));
  const delivery = booking.delivery || {};
  const deliverySubmitted = delivery.status === "Submitted";
  const revisionRequested = delivery.status === "RevisionRequested";
  const deliveryCompleted = ["Accepted", "AutoCompleted"].includes(delivery.status);
  const terminal = ["Declined", "Cancelled"].includes(booking.status);
  function handleAcceptDelivery() {
  setActionError("");
  setActionSuccess("");

  try {
    store.acceptDelivery(booking.id);
    setActionSuccess("Hasil pekerjaan berhasil diterima.");
  } catch (error) {
    setActionError(error.message);
  }
}

function handleRequestRevision() {
  setActionError("");
  setActionSuccess("");

  try {
    store.requestDeliveryRevision(booking.id, revisionNote);
    setRevisionNote("");
    setShowRevision(false);
    setActionSuccess("Permintaan revisi berhasil dikirim.");
  } catch (error) {
    setActionError(error.message);
  }
}
  return (
    <CustomerFrame
      title="Perjalanan kolaborasimu."
      description="Track your request status and keep every important detail in view."
    >
      {booking.status === "Requested" && params.has("submitted") && (
        <p role="status" className="customer-success">
          Request saved. Waiting for the creator to review it; no payment has been made.
        </p>
      )}
      {location.state?.notificationWarning && (
        <p className="customer-warning" role="alert">
          The request was saved, but its notification could not be saved. The order is still available in your orders.
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
        <ol className="customer-timeline" aria-label="Order progress">
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
            <dt>Creator</dt>
            <dd>
              <Link to={`/seller/${booking.creatorId}`}>
                {booking.creatorName}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Estimasi harga awal</dt>
            <dd>{money(booking.estimatedPrice)}</dd>
          </div>
          {Number.isSafeInteger(booking.finalPrice) && <div><dt>Seller's final price</dt><dd>{money(booking.finalPrice)}</dd></div>}
          <div><dt>ID transaksi</dt><dd>{booking.demoPayment?.id || `DG-${booking.id}`}</dd></div>
          <div><dt>Payment method</dt><dd>Demo QRIS (illustration)</dd></div>
          <div><dt>Payment total</dt><dd>{Number.isSafeInteger(booking.finalPrice) ? money(booking.finalPrice) : "Not set yet"}</dd></div>
          <div><dt>Payment status</dt><dd>{paymentInfo.label}</dd></div>
          {paymentStatusOf(booking) === "Paid" && booking.demoPayment?.paidAt && <div><dt>Payment date</dt><dd>{new Date(booking.demoPayment.paidAt).toLocaleString("en-US")}</dd></div>}
          <div>
            <dt>Work mode</dt>
            <dd>{booking.deliveryMode === "onsite" ? "On-site" : "Remote"}</dd>
          </div>
          <div>
            <dt>Requested date</dt>
            <dd>{bookingDate(booking.requestedDate)}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{new Date(booking.createdAt).toLocaleString("en-US")}</dd>
          </div>
          {booking.location && (
            <div>
              <dt>Lokasi proyek</dt>
              <dd>{booking.location}</dd>
            </div>
          )}
        </dl>
        <h3>Project requirements</h3>
        <p className="customer-preline">{booking.requirements}</p>
        <h3>Project description</h3>
        <p className="customer-preline">{booking.description}</p>
        {deliverySubmitted && (
  <section className="customer-delivery">
    <h3>Hasil pekerjaan Seller</h3>

    <p>
      Seller telah mengirimkan hasil pekerjaan.
      Silakan periksa sebelum menerima hasil.
    </p>

    {delivery.note && (
      <p className="customer-preline">
        {delivery.note}
      </p>
    )}

    {(delivery.files || []).map((file) =>
      publicUrl(file.url) ? (
        <p key={file.url}>
          <a href={publicUrl(file.url)} target="_blank" rel="noopener noreferrer">
            {file.name}
          </a>
        </p>
      ) : null,
    )}

    {delivery.deadlineAt && (
      <p>
        Batas pemeriksaan:{" "}
        {new Date(delivery.deadlineAt).toLocaleString("id-ID")}. Jika tidak
        ada tanggapan sampai batas ini, pesanan selesai otomatis dan dana
        diteruskan ke Seller.
      </p>
    )}
    <p>Revisi terpakai: {delivery.revisionCount}/3</p>

    <div className="customer-actions">
      <button
        type="button"
        className="button button--primary"
        onClick={handleAcceptDelivery}
      >
        Terima Hasil & Selesaikan Pesanan
      </button>

      <button
        type="button"
        className="button button--secondary"
        onClick={() => setShowRevision(!showRevision)}
      >
        Ajukan Revisi
      </button>
    </div>

    {showRevision && (
      <div className="customer-form">
        <label htmlFor="revision-note">
          Catatan Revisi
        </label>

        <textarea
          id="revision-note"
          className="field__control"
          maxLength={1000}
          value={revisionNote}
          onChange={(event) =>
            setRevisionNote(event.target.value)
          }
          placeholder="Jelaskan bagian pekerjaan yang perlu diperbaiki..."
        />

        <button
          type="button"
          className="button button--primary"
          disabled={!revisionNote.trim()}
          onClick={handleRequestRevision}
        >
          Kirim Permintaan Revisi
        </button>
      </div>
    )}
  </section>
)}

{revisionRequested && (
  <p className="customer-warning">
    Permintaan revisi sudah dikirim. Menunggu Seller
    mengirimkan hasil perbaikan.
  </p>
)}

{deliveryCompleted && (
  <p className="customer-success">
    {delivery.status === "AutoCompleted"
      ? "Pesanan selesai otomatis karena tidak ada tanggapan dalam 3 hari. Dana telah diteruskan ke Seller."
      : "Pesanan telah selesai. Dana telah diteruskan ke Seller."}
  </p>
)}

{actionError && (
  <p className="customer-warning" role="alert">
    {actionError}
  </p>
)}

{actionSuccess && (
  <p className="customer-success" role="status">
    {actionSuccess}
  </p>
)}
        <p className="customer-info">
          {bookingStatusDescription(booking.status)}
        </p>
        {booking.demoPayment?.kind === "simulation" && <p className="customer-info">Payment simulated. Tidak ada uang dipindahkan.</p>}
        {booking.status === "Accepted" && Number.isSafeInteger(booking.finalPrice) &&
          <Link className="button button--primary" to={`/payment/${booking.id}`}>Payment demo </Link>}
        <Link to={`/service/${booking.serviceId}`}>View service</Link>
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
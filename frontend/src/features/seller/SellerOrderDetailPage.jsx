import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { demoStore } from "../account/demoStore";
import { money } from "../../data/marketplace";
import { publicUrl } from "../../utils/publicUrl";
import { bookingDate } from "../customer/formatters";
import { sellerActions } from "../customer/customerStore";

import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";

import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

import {
  bookingLifecycle as lifecycle,
  bookingStatusDescription,
  bookingStatusLabel,
} from "../customer/bookingLifecycle";

const copy = {
  accept: {
    title: "Accept this request?",
    body: "Confirm the final price before accepting this order.",
    confirm: "Accept request",
  },
  decline: {
    title: "Decline this request?",
    body: "The booking will end and cannot be reopened.",
    confirm: "Decline request",
  },
};

const historyLabels = {
  Submitted: "Seller mengirim hasil pekerjaan",
  Resubmitted: "Seller mengirim hasil revisi",
  RevisionRequested: "Buyer meminta revisi",
  Accepted: "Buyer menerima hasil. Pesanan selesai",
  AutoCompleted: "Pesanan selesai otomatis (3 hari tanpa tanggapan Buyer)",
};

export default function SellerOrderDetailsPage() {
  const { bookingId } = useParams();
  const { bookings, customers, orders } = useSeller();

  const booking = bookings.find((item) => item.id === bookingId);

  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryLink, setDeliveryLink] = useState("");
  const [sending, setSending] = useState(false);
  const [showReport, setShowReport] = useState(false);
const [reportReason, setReportReason] = useState(
  "Fraud or suspicious activity",
);
const [reportDetails, setReportDetails] = useState("");
const [reportError, setReportError] = useState("");
const [reportSuccess, setReportSuccess] = useState("");
  if (!booking) {
    return (
      <SellerFrame title="Order not found.">
        <Empty title="This order does not belong to your Seller Profile.">
          Check the address or return to your order list.
        </Empty>

        <Link className="ws-link" to="/seller-dashboard/orders">
          ← Orders masuk
        </Link>
      </SellerFrame>
    );
  }

  const terminal = ["Declined", "Cancelled"].includes(booking.status);

  const delivery = booking.delivery || {};
  const deliveryStatus = delivery.status || "NotSubmitted";
  const deliveryDone = ["Accepted", "AutoCompleted"].includes(deliveryStatus);
  const canSubmitWork =
    booking.status === "Paid" &&
    ["NotSubmitted", "RevisionRequested"].includes(deliveryStatus);
  const escrow = booking.escrow;
  const history = [...(delivery.history || [])].reverse();

  function choose(action) {
    setError("");
    setDone("");
    setReason("");
    setPrice(
      action === "accept" && Number.isSafeInteger(booking.estimatedPrice)
        ? String(booking.estimatedPrice)
        : "",
    );
    setPending(action);
  }

  function submitDecision() {
    setError("");
    setDone("");

    try {
      orders.respondToBooking(booking.id, pending, {
        expectedStatus: booking.status,
        reason,
        finalPrice: price.trim() ? Number(price) : undefined,
      });

      setDone(
        `Order ${sellerActions[pending].label}. Customer dapat melihat perubahan status.`,
      );

      setPending("");
      setReason("");
    } catch (failure) {
      setError(failure.message);
    }
  }

  function submitWork(event) {
    event.preventDefault();
    setError("");
    setDone("");

    const link = deliveryLink.trim();

    if (link && !publicUrl(link)) {
      setError("Tautan hasil kerja harus berupa alamat http(s) yang valid.");
      return;
    }

    setSending(true);

    try {
      orders.submitDelivery(booking.id, {
        note: deliveryNote,
        files: link
          ? [{ name: "Tautan hasil kerja", url: publicUrl(link) }]
          : [],
        expectedStatus: deliveryStatus,
      });

      setDone(
        "Hasil pekerjaan berhasil dikirim kepada Buyer. Jika Buyer tidak menanggapi dalam 3 hari, pesanan selesai otomatis dan dana diteruskan kepadamu.",
      );

      setDeliveryNote("");
      setDeliveryLink("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSending(false);
    }
  }
function submitBuyerReport(event) {
  event.preventDefault();
  setReportError("");
  setReportSuccess("");

  try {
    const currentUser = demoStore.current();

    if (!currentUser) {
      throw new Error("Sesi Seller tidak ditemukan. Silakan login kembali.");
    }

    demoStore.submitAccountReport(
      booking.customerId,
      reportReason,
      reportDetails,
      { expectedUserId: currentUser.id },
    );

    setReportSuccess("Laporan akun Buyer berhasil dikirim kepada Admin.");
    setReportDetails("");
    setShowReport(false);
  } catch (failure) {
    setReportError(failure.message);
  }
}
  return (
    <SellerFrame
      title="Order details."
      description="Manage your order, submit work and handle customer revisions."
    >
      <Link className="ws-back" to="/seller-dashboard/orders">
        ← Incoming orders
      </Link>

      {done && (
        <p className="ws-success" role="status">
          {done}
        </p>
      )}

      {error && (
        <p className="ws-alert" role="alert">
          {error}
        </p>
      )}

      <div className="ws-layout">
        <article className="ws-panel">
          <StatusBadge status={booking.status} />

          <h2>{booking.serviceTitle}</h2>

          <p>ID {booking.id}</p>

          <ol className="ws-timeline" aria-label="Order progress">
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

          <p className="ws-note">
            {bookingStatusDescription(booking.status)}
          </p>

          {terminal && (
            <p className="ws-alert">
              Request {booking.status === "Declined" ? "declined" : "cancelled"}.
              {booking.declineReason
                ? ` Reason: ${booking.declineReason}`
                : ""}
            </p>
          )}

          <dl className="ws-facts">
            <div>
              <dt>Customer</dt>
              <dd>{customers[booking.customerId] || "Customer"}</dd>
            </div>

            <div>
              <dt>Starting price estimate</dt>
              <dd>{money(booking.estimatedPrice)}</dd>
            </div>

            {Number.isSafeInteger(booking.finalPrice) && (
              <div>
                <dt>Final price</dt>
                <dd>{money(booking.finalPrice)}</dd>
              </div>
            )}

            <div>
              <dt>Work mode</dt>
              <dd>
                {booking.deliveryMode === "onsite" ? "On-site" : "Remote"}
              </dd>
            </div>

            <div>
              <dt>Requested date</dt>
              <dd>{bookingDate(booking.requestedDate)}</dd>
            </div>

            <div>
              <dt>Submitted</dt>
              <dd>{dateTime(booking.createdAt)}</dd>
            </div>

            {booking.updatedAt && (
              <div>
                <dt>Updated</dt>
                <dd>{dateTime(booking.updatedAt)}</dd>
              </div>
            )}

            {booking.location && (
              <div>
                <dt>Project location</dt>
                <dd>{booking.location}</dd>
              </div>
            )}
          </dl>
          <hr />

<section className="ws-report">
  <h3>Pelaporan Akun Buyer</h3>

  <p>
    Jika Buyer melakukan penipuan, penyalahgunaan platform,
    atau pelanggaran lainnya, Seller dapat mengirimkan laporan
    kepada Admin Digarsa.
  </p>

  {reportError && (
    <p className="ws-alert" role="alert">
      {reportError}
    </p>
  )}

  {reportSuccess && (
    <p className="ws-success" role="status">
      {reportSuccess}
    </p>
  )}

  {!showReport ? (
    <button
      type="button"
      className="button button--danger"
      onClick={() => {
        setReportError("");
        setReportSuccess("");
        setShowReport(true);
      }}
    >
      Laporkan Akun Buyer
    </button>
  ) : (
    <form className="ws-form" onSubmit={submitBuyerReport}>
      <div className="field">
        <label htmlFor="buyer-report-reason">
          Alasan Laporan
        </label>

        <select
          id="buyer-report-reason"
          className="field__control"
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
          required
        >
          <option value="Fraud or suspicious activity">
            Penipuan atau aktivitas mencurigakan
          </option>
          <option value="Harassment or inappropriate communication">
            Pelecehan atau komunikasi tidak pantas
          </option>
          <option value="False identity or profile">
            Identitas atau profil palsu
          </option>
          <option value="Spam or platform abuse">
            Spam atau penyalahgunaan platform
          </option>
          <option value="Other">Lainnya</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="buyer-report-details">
          Kronologi dan Bukti Pendukung
        </label>

        <textarea
          id="buyer-report-details"
          className="field__control"
          minLength={10}
          maxLength={1000}
          required
          value={reportDetails}
          onChange={(event) => setReportDetails(event.target.value)}
          placeholder="Jelaskan kejadian yang menjadi alasan laporan..."
        />
      </div>

      <div className="ws-actions">
        <button
          type="submit"
          className="button button--danger"
          disabled={reportDetails.trim().length < 10}
        >
          Kirim Laporan
        </button>

        <button
          type="button"
          className="button button--secondary"
          onClick={() => setShowReport(false)}
        >
          Batal
        </button>
      </div>
    </form>
  )}
</section>
          <h3>Project requirements</h3>
          <p className="ws-preline">{booking.requirements}</p>

          <h3>Project description</h3>
          <p className="ws-preline">{booking.description}</p>

          {booking.status === "Requested" && (
            <>
              <hr />
              <h3>Keputusan</h3>

              {!pending ? (
                <div className="ws-actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => choose("accept")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => choose("decline")}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <div className="ws-inline-confirm" role="group" aria-label={copy[pending].title}>
                  <strong>{copy[pending].title}</strong>
                  <p>{copy[pending].body}</p>

                  {pending === "accept" ? (
                    <div className="field">
                      <label htmlFor="final-price">Final price (IDR)</label>
                      <input
                        id="final-price"
                        className="field__control"
                        inputMode="numeric"
                        value={price}
                        onChange={(event) => setPrice(event.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="field">
                      <label htmlFor="decline-reason">Alasan (opsional, dilihat Buyer)</label>
                      <textarea
                        id="decline-reason"
                        className="field__control"
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </div>
                  )}

                  <div className="ws-actions">
                    <button
                      type="button"
                      className={`button ${pending === "decline" ? "button--danger" : "button--primary"}`}
                      onClick={submitDecision}
                    >
                      {copy[pending].confirm}
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setPending("")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {booking.status === "Accepted" && (
            <p className="ws-notice">
              Menunggu Buyer menyelesaikan pembayaran. Hasil pekerjaan baru
              dapat dikirim setelah pembayaran tercatat.
            </p>
          )}

          {["Paid", "Completed"].includes(booking.status) && (
            <>
              <hr />
              <h3>Delivery status</h3>

              <p>
                {deliveryStatus === "NotSubmitted" &&
                  "Belum ada hasil pekerjaan yang dikirim."}
                {deliveryStatus === "Submitted" &&
                  "Hasil pekerjaan sudah dikirim. Menunggu pemeriksaan Buyer."}
                {deliveryStatus === "RevisionRequested" &&
                  "Buyer meminta revisi pekerjaan."}
                {deliveryStatus === "Accepted" &&
                  "Buyer menerima hasil pekerjaan. Pesanan telah selesai."}
                {deliveryStatus === "AutoCompleted" &&
                  "Buyer tidak menanggapi dalam 3 hari, jadi pesanan selesai otomatis."}
              </p>

              {delivery.revisionCount > 0 && (
                <p>Jumlah revisi: {delivery.revisionCount}/3</p>
              )}

              {deliveryStatus === "Submitted" && delivery.deadlineAt && (
                <p>
                  Selesai otomatis pada: {dateTime(delivery.deadlineAt)} jika
                  Buyer tidak menanggapi.
                </p>
              )}

              {deliveryDone && delivery.completedAt && (
                <p>Selesai pada: {dateTime(delivery.completedAt)}</p>
              )}

              {deliveryStatus === "RevisionRequested" && delivery.revisionNote && (
                <p className="ws-alert">
                  Catatan revisi dari Buyer:
                  <span className="ws-preline"> {delivery.revisionNote}</span>
                </p>
              )}

              {escrow && (
                <dl className="ws-facts">
                  <div>
                    <dt>Dana pesanan</dt>
                    <dd>{money(escrow.amount)}</dd>
                  </div>
                  <div>
                    <dt>Komisi Digarsa (5%)</dt>
                    <dd>{money(escrow.commission)}</dd>
                  </div>
                  <div>
                    <dt>Diterima Seller (95%)</dt>
                    <dd>{money(escrow.sellerNet)}</dd>
                  </div>
                  <div>
                    <dt>Status dana</dt>
                    <dd>
                      {escrow.status === "RELEASED"
                        ? `Sudah masuk saldo kamu (${dateTime(escrow.releasedAt)})`
                        : "Ditahan sampai Buyer menerima hasil atau 3 hari berlalu"}
                    </dd>
                  </div>
                </dl>
              )}

              {canSubmitWork && (
                <form className="ws-form" onSubmit={submitWork}>
                  <h3>
                    {deliveryStatus === "RevisionRequested"
                      ? "Kirim hasil revisi"
                      : "Kirim hasil pekerjaan"}
                  </h3>

                  <div className="field">
                    <label htmlFor="delivery-note">Catatan hasil pekerjaan</label>
                    <textarea
                      id="delivery-note"
                      className="field__control"
                      maxLength={3000}
                      required
                      minLength={5}
                      value={deliveryNote}
                      onChange={(event) => setDeliveryNote(event.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="delivery-link">Tautan file hasil (opsional)</label>
                    <input
                      id="delivery-link"
                      className="field__control"
                      type="url"
                      placeholder="https://drive.google.com/…"
                      maxLength={2000}
                      value={deliveryLink}
                      onChange={(event) => setDeliveryLink(event.target.value)}
                    />
                  </div>

                  <div className="ws-actions">
                    <button className="button button--primary" type="submit" disabled={sending}>
                      {sending ? "Mengirim…" : "Kirim ke Buyer"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </article>

        <article className="ws-panel">
          <h2>Order history</h2>

          {history.length ? (
            <ol className="ws-list">
              {history.map((item, index) => (
                <li key={`${item.action}-${item.at}-${index}`}>
                  <strong>{historyLabels[item.action] || item.action}</strong>
                  <p>{dateTime(item.at)}</p>
                  {item.note && <p className="ws-preline">{item.note}</p>}
                  {item.files?.map((file) =>
                    publicUrl(file.url) ? (
                      <p key={file.url}>
                        <a href={publicUrl(file.url)} target="_blank" rel="noopener noreferrer">
                          {file.name}
                        </a>
                      </p>
                    ) : null,
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p>Belum ada aktivitas pengiriman.</p>
          )}
        </article>
      </div>
    </SellerFrame>
  );
}
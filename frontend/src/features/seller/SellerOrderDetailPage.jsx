import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money } from "../../data/marketplace";
import { bookingDate } from "../customer/formatters";
import { sellerActions } from "../customer/customerStore";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

const lifecycle = ["Requested", "Accepted", "Paid", "Completed"];
const copy = {
  accept: {
    title: "Terima permintaan ini?",
    body: "Pelanggan akan melihat status Accepted. Detail harga akhir dan jadwal dibahas bersama pelanggan; belum ada pembayaran di sistem ini.",
    confirm: "Ya, terima permintaan",
  },
  decline: {
    title: "Tolak permintaan ini?",
    body: "Pelanggan akan melihat status Declined. Alur booking berhenti dan tidak bisa dibuka lagi.",
    confirm: "Ya, tolak permintaan",
  },
  complete: {
    title: "Tandai pekerjaan selesai?",
    body: "Pelanggan akan melihat status Completed. Pastikan hasil kerja sudah diserahkan.",
    confirm: "Ya, tandai selesai",
  },
};

export default function SellerOrderDetailPage() {
  const { bookingId } = useParams();
  const { bookings, customers, orders } = useSeller();
  const booking = bookings.find((item) => item.id === bookingId);
  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!booking)
    return (
      <SellerFrame title="Pesanan tidak ditemukan.">
        <Empty title="Pesanan ini bukan untuk Seller Profile-mu.">
          Periksa alamat, atau kembali ke daftar pesanan.
        </Empty>
        <Link className="ws-link" to="/seller-dashboard/orders">
          ← Pesanan masuk
        </Link>
      </SellerFrame>
    );

  const terminal = ["Declined", "Cancelled"].includes(booking.status);
  const available = Object.entries(sellerActions)
    .filter(([, rule]) => rule.from.includes(booking.status))
    .map(([key]) => key);

  function submit() {
    setError("");
    try {
      orders.respondToBooking(booking.id, pending, {
        expectedStatus: booking.status,
        reason,
      });
      setDone(
        `Pesanan ${sellerActions[pending].label}. Pelanggan melihat status terbaru di halaman Pesanan mereka.`,
      );
      setPending("");
      setReason("");
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <SellerFrame
      title="Tinjau pesanan."
      description="Baca brief pelanggan, lalu putuskan. Status yang kamu ubah di sini adalah status yang dilihat pelanggan."
    >
      <Link className="ws-back" to="/seller-dashboard/orders">
        ← Pesanan masuk
      </Link>
      {done && (
        <p className="ws-success" role="status">
          {done}
        </p>
      )}
      <div className="ws-layout">
        <article className="ws-panel">
          <StatusBadge status={booking.status} />
          <h2>{booking.serviceTitle}</h2>
          <p>ID {booking.id}</p>
          <ol className="ws-timeline" aria-label="Tahapan booking">
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
            <p className="ws-alert">
              Permintaan {booking.status === "Declined" ? "ditolak" : "dibatalkan"}.
              {booking.declineReason ? ` Alasan: ${booking.declineReason}` : ""}
            </p>
          )}
          <dl className="ws-facts">
            <div>
              <dt>Pelanggan</dt>
              <dd>{customers[booking.customerId] || "Pelanggan"}</dd>
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
              <dt>Diajukan</dt>
              <dd>{dateTime(booking.createdAt)}</dd>
            </div>
            {booking.updatedAt && (
              <div>
                <dt>Diperbarui</dt>
                <dd>{dateTime(booking.updatedAt)}</dd>
              </div>
            )}
            {booking.location && (
              <div>
                <dt>Lokasi proyek</dt>
                <dd>{booking.location}</dd>
              </div>
            )}
          </dl>
          <h3>Kebutuhan proyek</h3>
          <p className="ws-preline">{booking.requirements}</p>
          <h3>Deskripsi proyek</h3>
          <p className="ws-preline">{booking.description}</p>
        </article>

        <aside className="ws-panel" aria-label="Keputusan seller">
          <h2>Keputusan.</h2>
          {available.length === 0 && (
            <p>
              Tidak ada aksi lanjutan untuk status {booking.status}. Pembayaran
              dan pembatalan oleh pelanggan belum tersedia.
            </p>
          )}
          {!pending && available.length > 0 && (
            <div className="ws-actions">
              {available.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`button ${key === "decline" ? "button--danger" : key === "accept" ? "button--primary" : "button--aqua"}`}
                  onClick={() => {
                    setDone("");
                    setError("");
                    setPending(key);
                  }}
                >
                  {key === "accept" && "Terima"}
                  {key === "decline" && "Tolak"}
                  {key === "complete" && "Tandai selesai"}
                </button>
              ))}
            </div>
          )}
          {pending && (
            <div className="ws-form">
              <h3>{copy[pending].title}</h3>
              <p>{copy[pending].body}</p>
              {pending === "decline" && (
                <div className="field">
                  <label htmlFor="decline-reason">Alasan (opsional)</label>
                  <textarea
                    id="decline-reason"
                    className="field__control"
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <span className="field__hint">
                    Alasan tersimpan di booking; maksimal 500 karakter.
                  </span>
                </div>
              )}
              <div className="ws-actions">
                <button
                  type="button"
                  className={`button ${pending === "decline" ? "button--danger" : "button--primary"}`}
                  onClick={submit}
                >
                  {copy[pending].confirm}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setPending("")}
                >
                  Batal
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="ws-alert" role="alert">
              {error}
            </p>
          )}
          <p>
            <Link className="ws-link" to={`/service/${booking.serviceId}`}>
              Lihat layanan ↗
            </Link>
          </p>
        </aside>
      </div>
    </SellerFrame>
  );
}

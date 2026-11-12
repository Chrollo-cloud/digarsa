import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money } from "../../data/marketplace";
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
  start: {
    title: "Mulai pengerjaan pesanan?",
    body: "Pelanggan akan melihat bahwa pekerjaan dimulai setelah pembayaran demo tercatat.",
    confirm: "Ya, mulai pengerjaan",
  },
  accept: {
    title: "Terima permintaan ini?",
    body: "Pelanggan akan melihat status Diterima Seller. Harga akhir di bawah dikonfirmasi saat diterima. Belum ada pembayaran; pelanggan dapat menjalankan simulasi demo secara terpisah.",
    confirm: "Ya, terima permintaan",
  },
  decline: {
    title: "Tolak permintaan ini?",
    body: "Pelanggan akan melihat status Ditolak Seller. Alur booking berhenti dan tidak bisa dibuka lagi.",
    confirm: "Ya, tolak permintaan",
  },
  complete: {
    title: "Tandai pekerjaan selesai?",
    body: "Pelanggan akan melihat status Selesai. Pastikan hasil kerja sudah diserahkan.",
    confirm: "Ya, tandai selesai",
  },
};

export default function SellerOrderDetailPage() {
  const { bookingId } = useParams();
  const { bookings, customers, orders } = useSeller();
  const booking = bookings.find((item) => item.id === bookingId);
  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
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
        finalPrice: price.trim() ? Number(price) : NaN,
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
      description="Baca kebutuhan pelanggan, lalu putuskan. Status yang kamu ubah di sini adalah status yang dilihat pelanggan."
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
          <ol className="ws-timeline" aria-label="Tahapan pesanan">
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
          <p className="ws-note">{bookingStatusDescription(booking.status)}</p>
          {terminal && (
            <p className="ws-alert">
              Permintaan{" "}
              {booking.status === "Declined" ? "ditolak" : "dibatalkan"}.
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
            <p>{bookingStatusDescription(booking.status)}</p>
          )}
          {booking.status === "Accepted" && !Number.isSafeInteger(booking.finalPrice) && <div className="ws-form">
            <p>Pesanan lama ini belum memiliki harga akhir. Konfirmasikan harga yang disepakati sebelum simulasi pelanggan.</p>
            <label className="field">Harga akhir (IDR)<input className="field__control" type="number" min="0" step="1" value={price} onChange={event => setPrice(event.target.value)} /></label>
            <button type="button" className="button button--primary" onClick={() => {
              try { orders.confirmAcceptedPrice(booking.id, price.trim() ? Number(price) : NaN); setError(""); }
              catch (failure) { setError(failure.message); }
            }}>Konfirmasi harga akhir</button>
          </div>}
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
                    setPrice(String(booking.estimatedPrice));
                    setPending(key);
                  }}
                >
                  {key === "accept" && "Terima"}
                  {key === "decline" && "Tolak"}
                  {key === "start" && "Mulai pengerjaan"}
                  {key === "complete" && "Tandai selesai"}
                </button>
              ))}
            </div>
          )}
          {pending && available.includes(pending) && (
            <div className="ws-form">
              <h3>{copy[pending].title}</h3>
              <p>{copy[pending].body}</p>
              {pending === "accept" && <label className="field">Harga akhir yang disepakati (IDR)
                <input className="field__control" type="number" min="0" max="1000000000000" step="1" value={price} onChange={event => setPrice(event.target.value)} />
              </label>}
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

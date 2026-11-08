import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../account/authContext";
import { reviewStore } from "./reviewClient";
import { reviewActions } from "./reviewActionsClient";
import { useReviews } from "./useReviews";
import RatingStars from "./RatingStars";
import { services } from "../../data/marketplace";
import "./reviews.css";

function ReviewComposer({ bookingId }) {
  const { user, data, error } = useReviews(() =>
    reviewStore.getEligibility(bookingId),
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const serviceAvailable =
    data && services.some((row) => row.id === data.booking.service_id);
  const locked = useRef(false);
  const successHeading = useRef(null);
  function submit(event) {
    event.preventDefault();
    if (locked.current || !data?.eligible) return;
    locked.current = true;
    setBusy(true);
    setFailure("");
    queueMicrotask(() => {
      try {
        const saved = reviewActions.submit(
          {
            booking_id: bookingId,
            service_id: data.booking.service_id,
            seller_profile_id: data.booking.seller_profile_id,
            rating,
            comment,
          },
          { expected_user_id: user.id },
        );
        setResult(saved);
      } catch (error) {
        setFailure(error.message);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    });
  }
  if (error)
    return (
      <div className="review-error" role="alert">
        {error}
      </div>
    );
  if (result)
    return (
      <section
        className="review-form-card review-confirmation"
        aria-label="Konfirmasi ulasan"
      >
        <span className="review-success-symbol" aria-hidden="true">
          ✓
        </span>
        <h2
          ref={(node) => {
            successHeading.current = node;
            node?.focus();
          }}
          tabIndex={-1}
        >
          Terima kasih, ceritamu berarti.
        </h2>
        <p role="status">
          Ulasanmu tersimpan dan tampil sebagai ulasan booking terverifikasi.
        </p>
        <RatingStars value={result.review.rating} size={25} />
        <p className="review-comment">{result.review.comment}</p>
        {result.notification_error && (
          <div className="review-error" role="alert">
            <p>{result.notification_error}</p>
            <button
              type="button"
              onClick={() => {
                try {
                  reviewActions.retryNotification(result.review.id);
                  setResult({ ...result, notification_error: "" });
                } catch (error) {
                  setFailure(error.message);
                }
              }}
            >
              Coba kirim notifikasi lagi
            </button>
          </div>
        )}
        {failure && <p role="alert">{failure}</p>}
        <Link className="button button--primary" to="/reviews">
          Lihat ulasan saya ↗
        </Link>
      </section>
    );
  if (!data.eligible)
    return (
      <section className="review-form-card review-empty">
        <h2>
          {data.review
            ? "Ceritamu sudah tercatat."
            : "Booking belum dapat diulas."}
        </h2>
        <p>{data.reason}</p>
        <Link to={data.review ? "/reviews" : `/orders/${bookingId}`}>
          {data.review ? "Lihat ulasan saya ↗" : "Kembali ke pesanan ↗"}
        </Link>
      </section>
    );
  return (
    <div className="review-form-layout">
      <aside className="review-booking-summary">
        <span className="review-kicker">KOLABORASI SELESAI</span>
        <h2>{data.booking.service_title}</h2>
        <p>{data.booking.seller_name}</p>
        <span className="review-verified">✓ Completed · milik akunmu</span>
        <hr />
        <p>
          Ulasan yang jujur membantu pelanggan lain menemukan partner kreatif
          yang tepat.
        </p>
        <Link
          to={
            serviceAvailable
              ? `/service/${data.booking.service_id}`
              : `/orders/${bookingId}`
          }
        >
          {serviceAvailable
            ? "Lihat layanan ↗"
            : "Lihat booking layanan arsip ↗"}
        </Link>
      </aside>
      <form className="review-form-card" onSubmit={submit} aria-busy={busy}>
        <h2>Bagaimana kolaborasimu?</h2>
        <p>Bagikan pengalaman tentang proses dan hasil yang kamu terima.</p>
        <fieldset className="review-star-picker" disabled={busy}>
          <legend>
            Penilaian <span>(wajib)</span>
          </legend>
          <div>
            {[1, 2, 3, 4, 5].map((star) => (
              <label key={star} className={star <= rating ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="rating"
                  value={star}
                  checked={rating === star}
                  onChange={() => setRating(star)}
                  required
                  aria-label={`${star} bintang`}
                />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </div>
          <p aria-live="polite">
            {rating
              ? `${rating} dari 5 · ${["", "Kurang memuaskan", "Perlu ditingkatkan", "Cukup baik", "Memuaskan", "Sangat memuaskan"][rating]}`
              : "Pilih 1–5 bintang. Gunakan tombol panah untuk mengubah pilihan."}
          </p>
        </fieldset>
        <label className="review-comment-label" htmlFor="review-comment">
          Pengalaman kolaborasi
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          required
          minLength={10}
          maxLength={2000}
          rows={6}
          placeholder="Ceritakan proses komunikasi, pengerjaan, dan hasil kolaborasi…"
          disabled={busy}
          aria-describedby="review-comment-help"
        />
        <div id="review-comment-help" className="review-form-help">
          <span>10–2000 karakter · Tulis tanpa informasi pribadi.</span>
          <span>{comment.length}/2000</span>
        </div>
        <p className="review-public-note">
          Nama akun dan ulasanmu akan tampil di halaman layanan serta profil
          kreator. Satu booking hanya dapat diulas sekali; pengeditan belum
          tersedia.
        </p>
        {failure && (
          <p className="review-error" role="alert">
            {failure}
          </p>
        )}
        <button
          className="button button--primary"
          type="submit"
          disabled={busy}
        >
          {busy ? "Menyimpan…" : "Bagikan ulasan ↗"}
        </button>
      </form>
    </div>
  );
}
export default function ReviewFormPage() {
  useEffect(() => {
    document.title = "Tulis ulasan — Digarsa";
  }, []);
  const { bookingId } = useParams();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [bookingId]);
  const { user } = useAuth();
  return (
    <div className="reviews-page">
      <div className="reviews-shell">
        <header className="reviews-page-heading">
          <div>
            <span className="review-kicker">DIGARSA / CERITA KOLABORASI</span>
            <h1>
              Ceritakan pengalamanmu<span>.</span>
            </h1>
          </div>
          <Link to="/reviews">← Ulasan saya</Link>
        </header>
        <ReviewComposer key={`${user.id}-${bookingId}`} bookingId={bookingId} />
      </div>
    </div>
  );
}

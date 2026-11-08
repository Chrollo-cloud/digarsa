import { useEffect, useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import { reviewStore } from "./reviewClient";
import { useReviews } from "./useReviews";
import ReviewsBoard from "./ReviewsBoard";

export default function ReviewsPage() {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  const { user, data, error } = useReviews(() => ({
    rows: reviewStore.listOwn(),
    completed: reviewStore.listCompletedBookings(),
  }));
  useEffect(() => {
    document.title = "Ulasan saya — Digarsa";
  }, []);
  const eligible = data?.completed.filter((row) => !row.review) || [];
  return (
    <div className="reviews-page">
      <div className="reviews-shell">
        <header className="reviews-page-heading">
          <div>
            <span className="review-kicker">DIGARSA / RUANG PERSONAL</span>
            <h1>
              Jejak kolaborasimu<span>.</span>
            </h1>
            <p>Pengalaman nyata. Kepercayaan untuk karya berikutnya.</p>
          </div>
          <nav aria-label="Navigasi ulasan">
            <Link to="/dashboard">← Dashboard</Link>
            <Link to="/orders">Pesanan ↗</Link>
          </nav>
        </header>
        {error ? (
          <p role="alert" className="review-error">
            {error}
          </p>
        ) : (
          <ReviewsBoard key={user.id} rows={data.rows} personal>
            <section
              className="review-eligible"
              aria-label="Booking selesai untuk diulas"
            >
              <header>
                <h2>Siap dibagikan.</h2>
                <span>
                  {eligible.filter((row) => row.eligible).length} booking siap
                  diulas
                </span>
              </header>
              {eligible.length ? (
                eligible.map(({ booking, eligible, reason }) => (
                  <article key={booking.id}>
                    <div>
                      <h3>{booking.service_title}</h3>
                      <p>{booking.seller_name} · Completed</p>
                      {reason && <p>{reason}</p>}
                    </div>
                    {eligible && (
                      <Link to={`/review/${booking.id}`}>Tulis ulasan ↗</Link>
                    )}
                  </article>
                ))
              ) : (
                <p>
                  {data.completed.length
                    ? "Semua ulasanmu sudah tercatat. Booking Completed berikutnya akan muncul di sini."
                    : "Belum ada booking Completed untuk diulas. Ikuti perkembangan pesananmu terlebih dahulu."}
                </p>
              )}
            </section>
          </ReviewsBoard>
        )}
        <p className="review-demo">
          Demo lokal · Ulasan disimpan di browser ini. Label terverifikasi
          menunjukkan pemeriksaan booking demo, bukan verifikasi server.
        </p>
      </div>
    </div>
  );
}

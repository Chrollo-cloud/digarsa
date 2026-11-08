import { useState } from "react";
import { summarizeReviews } from "./reviewStore";
import ReviewSummary from "./ReviewSummary";
import ReviewCard from "./ReviewCard";
import "./reviews.css";

export default function ReviewsBoard({ rows, personal = false, children }) {
  const [rating, setRating] = useState("");
  const [sort, setSort] = useState("newest");
  const visible = rows
    .filter((row) => !rating || row.rating === Number(rating))
    .sort((a, b) =>
      sort === "highest"
        ? b.rating - a.rating || b.created_at.localeCompare(a.created_at)
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  return (
    <div className="review-board">
      <ReviewSummary summary={summarizeReviews(rows)} personal={personal} />
      <div className="review-list-column">
        <div className="review-accent">
          <span className="review-kicker">WHERE IDEAS MEET TALENT.</span>
          <h3>
            {personal
              ? "Cerita baik layak dibagikan."
              : "Karya bertemu kepercayaan."}
          </h3>
          <p>
            {personal
              ? "Pengalamanmu membantu pelanggan lain memilih kolaborasi."
              : "Ulasan dari pelanggan yang telah menyelesaikan kolaborasi."}
          </p>
          <span aria-hidden="true">✳</span>
        </div>
        {children}
        <div className="review-controls">
          <label>
            Penilaian
            <select
              aria-label="Filter penilaian"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
            >
              <option value="">Semua bintang</option>
              {[5, 4, 3, 2, 1].map((star) => (
                <option key={star} value={star}>
                  {star} bintang
                </option>
              ))}
            </select>
          </label>
          <label>
            Urutkan
            <select
              aria-label="Urutkan ulasan"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="highest">Rating tertinggi</option>
            </select>
          </label>
          <span role="status">
            {visible.length} dari {rows.length} ulasan
          </span>
        </div>
        <div className="review-list">
          {visible.length ? (
            visible.map((row) => <ReviewCard key={row.id} review={row} />)
          ) : (
            <div className="review-empty">
              <span aria-hidden="true">✳</span>
              <h3>
                {rows.length
                  ? "Belum ada ulasan dengan penilaian ini."
                  : "Cerita pertama dimulai darimu."}
              </h3>
              <p>
                {rows.length
                  ? "Pilih penilaian lain untuk melihat ulasan."
                  : personal
                    ? "Setelah booking selesai, bagikan pengalaman kolaborasimu."
                    : "Belum ada ulasan pelanggan terverifikasi. Angka akan muncul setelah ulasan pertama."}
              </p>
              {rating && (
                <button type="button" onClick={() => setRating("")}>
                  Lihat semua penilaian
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

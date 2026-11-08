import RatingStars from "./RatingStars";

export default function ReviewSummary({ summary, personal = false }) {
  return (
    <aside
      className="review-summary"
      aria-label="Ringkasan penilaian terverifikasi"
    >
      <span className="review-kicker">
        {personal
          ? "PENILAIAN YANG KAMU BAGIKAN"
          : "CERITA DARI KOLABORASI NYATA"}
      </span>
      <h3>{personal ? "Suaramu berarti." : "Kesan yang tertinggal."}</h3>
      <div className="review-average">
        <strong>
          {summary.average === null
            ? "—"
            : summary.average.toLocaleString("id-ID", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
        </strong>
        <span>/ 5</span>
      </div>
      <RatingStars value={summary.average} size={23} />
      <p>
        <b>{summary.total}</b> ulasan terverifikasi
        {personal ? " ditulis olehmu" : ""}
      </p>
      <div className="review-distribution">
        {summary.distribution.map(({ rating, count, percentage }) => (
          <div key={rating}>
            <span>
              {rating} <span aria-hidden="true">★</span>
            </span>
            <progress
              max={summary.total || 1}
              value={count}
              aria-label={`${rating} bintang: ${count} dari ${summary.total} ulasan`}
            />
            <small>{Math.round(percentage)}%</small>
          </div>
        ))}
      </div>
      <p className="review-verified-note">
        <span aria-hidden="true">✓</span> Hanya dari booking Completed.
        <br />
        Testimoni demo tidak termasuk hitungan.
      </p>
    </aside>
  );
}

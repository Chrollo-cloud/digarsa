import RatingStars from "./RatingStars";

export default function ReviewSummary({ summary, personal = false }) {
  return (
    <aside
      className="review-summary"
      aria-label="Verified rating summary"
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
            : summary.average.toLocaleString("en-US", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
        </strong>
        <span>/ 5</span>
      </div>
      <RatingStars value={summary.average} size={23} />
      <p>
        <b>{summary.total}</b> verified reviews
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
              aria-label={`${rating} bintang: ${count} of ${summary.total} ulasan`}
            />
            <small>{Math.round(percentage)}%</small>
          </div>
        ))}
      </div>
      <p className="review-verified-note">
        <span aria-hidden="true">✓</span> Hanya of booking Completed.
        <br />
        Demo testimonials are not included in the count.
      </p>
    </aside>
  );
}

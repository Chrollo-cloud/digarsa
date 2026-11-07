import { rating } from "../../data/marketplace";

export default function Reviews({ reviews }) {
  return (
    <section className="market-section" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">
        Cerita kolaborasi <span>({reviews.length})</span>
      </h2>
      <p>★ {rating(reviews)} / 5 · Ulasan ilustratif dari data demo</p>
      <div className="market-review-grid">
        {reviews.map((review) => (
          <article className="market-panel" key={review.id}>
            <div className="market-review-head">
              <strong>{review.name}</strong>
              <span>★ {review.score}/5</span>
            </div>
            <p>{review.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

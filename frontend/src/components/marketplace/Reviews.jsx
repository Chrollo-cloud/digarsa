export default function Reviews({ reviews }) {
  if (!reviews.length) return null;
  return (
    <section className="market-section" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">
        Testimoni demo <span>({reviews.length})</span>
      </h2>
      <p>
        Ilustrasi dari prototipe, bukan ulasan pelanggan terverifikasi. Tidak
        termasuk rata-rata atau jumlah ulasan terverifikasi.
      </p>
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

export default function CatalogRating({ rating, count = 0 }) {
  if (!Number.isFinite(rating) || count < 1) return <small>No reviews yet</small>;
  return <span aria-label={`${rating.toFixed(1)} from ${count} reviews`}>
    ★ {rating.toFixed(1)} <small>({count})</small>
  </span>;
}

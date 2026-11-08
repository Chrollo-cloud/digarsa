import { Link } from "react-router-dom";
import RatingStars from "./RatingStars";
import { services } from "../../data/marketplace";

export default function ReviewCard({ review }) {
  const serviceAvailable = services.some((row) => row.id === review.service_id);
  const initials = review.reviewer_name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <article className="review-card">
      <header>
        <span className="review-avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h3>{review.reviewer_name}</h3>
          <time dateTime={review.created_at}>
            {new Date(review.created_at).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>
        <RatingStars value={review.rating} />
      </header>
      <p className="review-comment">{review.comment}</p>
      <footer>
        {serviceAvailable ? (
          <Link to={`/service/${review.service_id}`}>
            {review.service_title} ↗
          </Link>
        ) : (
          <span className="review-archived-service">
            {review.service_title} · Arsip layanan
          </span>
        )}
        <span className="review-verified">✓ Booking terverifikasi</span>
      </footer>
    </article>
  );
}

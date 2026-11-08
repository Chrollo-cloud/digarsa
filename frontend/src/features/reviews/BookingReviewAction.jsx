import { Link } from "react-router-dom";
import { useReviews } from "./useReviews";
import { reviewStore } from "./reviewClient";

export default function BookingReviewAction({ bookingId }) {
  const { data, error } = useReviews(() =>
    reviewStore.getEligibility(bookingId),
  );
  if (error)
    return (
      <p className="customer-warning" role="alert">
        {error}
      </p>
    );
  return (
    <div className="customer-info">
      {data.review ? (
        <Link to="/reviews">✓ Sudah diulas · Lihat ulasan saya ↗</Link>
      ) : data.eligible ? (
        <Link className="button button--primary" to={`/review/${bookingId}`}>
          Tulis ulasan kolaborasi ↗
        </Link>
      ) : (
        <p>{data.reason}</p>
      )}
    </div>
  );
}

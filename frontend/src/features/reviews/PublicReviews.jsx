import { reviewStore } from "./reviewClient";
import { useReviews } from "./useReviews";
import ReviewsBoard from "./ReviewsBoard";

export default function PublicReviews({ serviceId, sellerProfileId }) {
  const { data, error } = useReviews(() =>
    reviewStore.listPublic(
      serviceId
        ? { service_id: serviceId }
        : { seller_profile_id: sellerProfileId },
    ),
  );
  return (
    <section
      className="market-section verified-reviews"
      aria-label="Verified customer reviews"
    >
      <header className="review-public-heading">
        <span className="review-kicker">DARI PELANGGAN DIGARSA</span>
        <h2>
          Pengalaman kolaborasi<span>.</span>
        </h2>
      </header>
      {error ? (
        <p role="alert" className="review-error">
          {error}
        </p>
      ) : (
        <ReviewsBoard key={serviceId || sellerProfileId} rows={data} />
      )}
      <p className="review-demo">
        Verifikasi berdasarkan booking Completed pada data demo di browser ini,
        bukan verifikasi server.
      </p>
    </section>
  );
}

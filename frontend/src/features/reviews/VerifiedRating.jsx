import { reviewStore } from "./reviewClient";
import { useReviews } from "./useReviews";

export default function VerifiedRating({
  serviceId,
  sellerProfileId,
  compact = false,
}) {
  const { data, error } = useReviews(() =>
    reviewStore.getSummary(
      serviceId
        ? { service_id: serviceId }
        : { seller_profile_id: sellerProfileId },
    ),
  );
  if (error) return <span title={error}>Rating unavailable</span>;
  const average =
    data.average === null
      ? "—"
      : data.average.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (compact)
    return (
      <span
        aria-label={`${average} of 5, ${data.total} verified reviews`}
      >
        ★ {average} <small>({data.total} terverifikasi)</small>
      </span>
    );
  return (
    <span>
      ★{" "}
      {data.average === null
        ? "—"
        : data.average.toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}{" "}
      · {data.total} verified reviews
    </span>
  );
}

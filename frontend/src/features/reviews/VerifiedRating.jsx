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
  if (error) return <span title={error}>Rating belum tersedia</span>;
  const average =
    data.average === null
      ? "—"
      : data.average.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (compact)
    return (
      <span
        aria-label={`${average} dari 5, ${data.total} ulasan terverifikasi`}
      >
        ★ {average} <small>({data.total} terverifikasi)</small>
      </span>
    );
  return (
    <span>
      ★{" "}
      {data.average === null
        ? "—"
        : data.average.toLocaleString("id-ID", {
            maximumFractionDigits: 2,
          })}{" "}
      · {data.total} ulasan terverifikasi
    </span>
  );
}

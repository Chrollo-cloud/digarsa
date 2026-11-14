import { useId } from "react";

export default function RatingStars({ value, size = 18 }) {
  const prefix = useId();
  return (
    <span
      className="review-stars"
      role="img"
      aria-label={
        value === null
          ? "Belum ada penilaian"
          : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} of 5 bintang`
      }
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={`${prefix}-${index}`}>
              <rect
                width={Math.max(0, Math.min(1, (value || 0) - index)) * 24}
                height="24"
              />
            </clipPath>
          </defs>
          <path
            d="m12 2.8 2.85 5.77 6.37.93-4.61 4.49 1.09 6.35L12 17.34l-5.7 3 1.09-6.35-4.61-4.49 6.37-.93L12 2.8Z"
            fill="#e1e6e2"
          />
          <path
            d="m12 2.8 2.85 5.77 6.37.93-4.61 4.49 1.09 6.35L12 17.34l-5.7 3 1.09-6.35-4.61-4.49 6.37-.93L12 2.8Z"
            fill="currentColor"
            clipPath={`url(#${prefix}-${index})`}
          />
        </svg>
      ))}
    </span>
  );
}

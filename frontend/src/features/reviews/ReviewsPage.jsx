import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { reviewStore } from "./reviewClient";
import { useReviews } from "./useReviews";
import RatingStars from "./RatingStars";
import { services } from "../../data/marketplace";
import "./reviews.css";

export default function ReviewsPage() {
  const [params, setParams] = useSearchParams();
  const history = params.get("tab") === "history";
  const tabs = useRef(null);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  const { user, data, error } = useReviews(() => ({
    rows: reviewStore.listOwn(),
    completed: reviewStore.listCompletedBookings(),
  }));
  useEffect(() => { document.title = "My Reviews — Digarsa"; }, []);
  const eligible = data?.completed.filter((row) => row.eligible && !row.review) || [];
  function selectTab(next) {
    setParams(next ? { tab: "history" } : {}, { replace: true });
  }
  return (
    <div className="reviews-page">
      <div className="reviews-shell">
        <header className="reviews-page-heading">
          <div>
            <span className="review-kicker">DIGARSA / RUANG PERSONAL</span>
            <h1>My Reviews<span>.</span></h1>
            <p>Real experiences. Trust for the next project.</p>
          </div>
        </header>
        {error ? <p role="alert" className="review-error">{error}</p> : (
          <section key={user.id} className="personal-reviews">
            <div className="personal-review-tabs" role="tablist" aria-label="Review booking" ref={tabs}
              onKeyDown={(event) => {
                const index = { ArrowRight: history ? 0 : 1, ArrowLeft: history ? 0 : 1, Home: 0, End: 1 }[event.key];
                if (index !== undefined) {
                  event.preventDefault();
                  selectTab(index === 1);
                  tabs.current.querySelectorAll('[role="tab"]')[index].focus();
                }
              }}>
              {[[false, "Belum Dinilai", eligible.length], [true, "Review Saya", data.rows.length]].map(([isHistory, label, count]) => (
                <button key={label} type="button" role="tab" id={isHistory ? "review-history-tab" : "review-queue-tab"}
                  aria-selected={history === isHistory} aria-controls="personal-review-panel"
                  tabIndex={history === isHistory ? 0 : -1} onClick={() => selectTab(isHistory)}>
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
            <div id="personal-review-panel" role="tabpanel" tabIndex={0}
              aria-labelledby={history ? "review-history-tab" : "review-queue-tab"}>
              {(history ? data.rows : eligible).length ? (
                <div className="personal-review-list">
                  {history ? data.rows.map((row) => <PersonalReview key={row.id} review={row} />)
                    : eligible.map(({ booking }) => <PersonalReview key={booking.id} booking={booking} />)}
                </div>
              ) : (
                <div className="review-empty">
                  <h2>{history ? "Your story is ready to be shared." : "Everything is up to date."}</h2>
                  <p>{history ? "Reviews you submit will appear here." : "No completed bookings are ready for a review. Track your collaborations in Orders."}</p>
                  <Link to="/orders">View orders </Link>
                </div>
              )}
            </div>
          </section>
        )}
        <p className="review-demo">Local demo · Reviews are stored in this browser. Demo booking verification is not server verification.</p>
      </div>
    </div>
  );
}

function PersonalReview({ review, booking }) {
  const context = review || booking;
  const service = services.find((row) => row.id === context.service_id);
  const date = review?.created_at || booking?.completed_at;
  return (
    <article className="personal-review-card">
      <header>
        <div><span className="review-kicker">KOLABORASI TERVERIFIKASI</span><h2>{context.seller_name}</h2></div>
        {review && <RatingStars value={review.rating} size={21} />}
      </header>
      <div className="personal-review-service">
        {service?.image ? <img src={service.image} alt="" loading="lazy" /> : <span className="personal-review-placeholder" aria-hidden="true">D.</span>}
        <div>
          <h3>{service ? <Link to={`/service/${service.id}`}>{context.service_title}</Link> : context.service_title}</h3>
          <p>{review ? "Dinilai" : "Diselesaikan"} {date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "· tanggal belum tercatat"}</p>
        </div>
      </div>
      {review && <p className="review-comment">{review.comment}</p>}
      <footer>
        <span className="review-verified">✓ Booking Completed{review?.updated_at ? " · Diperbarui" : ""}</span>
        <Link className="button button--primary" to={`/review/${review?.booking_id || booking.id}${review ? "?edit=1" : ""}`}>
          {review ? "Edit review" : "My Reviews"}
        </Link>
      </footer>
    </article>
  );
}

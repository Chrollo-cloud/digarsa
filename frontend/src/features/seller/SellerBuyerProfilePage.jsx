
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Avatar from "../profile/Avatar";
import { Empty } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import "./seller-buyer-profile.css";

const REPORT_REASONS = [
  "Fraud or suspicious activity",
  "Harassment or inappropriate communication",
  "False identity or profile",
  "Spam or platform abuse",
  "Other",
];

export default function SellerBuyerProfilePage() {
  const { buyerId } = useParams();
  const [params] = useSearchParams();
  const { user, bookings, accounts } = useSeller();
  const relatedBookings = bookings
    .filter((booking) => booking.customerId === buyerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let buyer = null;
  let accessError = "";
  if (relatedBookings.length) {
    try { buyer = accounts.buyerProfileForSeller(buyerId); }
    catch (error) { accessError = error.message; }
  }
  const booking = relatedBookings.find((row) => row.id === params.get("bookingId")) || relatedBookings[0];
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function submitReport(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      accounts.submitBuyerReport(buyerId, booking.id, reason, details, { expectedUserId: user.id });
      setDetails("");
      setReportOpen(false);
      setNotice("Report saved in this browser only. It has not been sent to Digarsa support or reviewed by an Admin.");
    } catch (failure) { setError(failure.message); }
  }

  return (
    <SellerFrame title={buyer ? `${buyer.name}'s Buyer profile.` : "Buyer profile."} description="Account details available to Sellers who have an order with this Buyer.">
      <Link className="ws-back" to="/seller-dashboard/orders">Back to incoming orders</Link>
      {accessError ? <div className="ws-alert" role="alert">{accessError}</div> : !buyer ? (
        <Empty title="Buyer profile unavailable.">
          This Buyer is not associated with an order in your Seller account, or the account profile could not be found.
        </Empty>
      ) : (
        <section className="seller-buyer-profile" aria-label="Buyer account profile">
          <header className="seller-buyer-profile__header">
            <Avatar user={buyer} className="seller-buyer-profile__avatar" />
            <div>
              <span className="ws-kicker">BUYER PROFILE</span>
              <h2>{buyer.name}</h2>
              {buyer.joinedAt ? <p>Member since {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(buyer.joinedAt))}</p> : <p>Join date is not available.</p>}
            </div>
          </header>
          <dl className="seller-buyer-profile__facts">
            <div><dt>About</dt><dd>{buyer.bio || "The Buyer has not shared a bio."}</dd></div>
            <div><dt>Area</dt><dd>{buyer.city || "The Buyer has not shared a public area."}</dd></div>
            <div><dt>Phone</dt><dd>{buyer.phone || "Not shared with Sellers."}</dd></div>
            {buyer.status && <div><dt>Account status</dt><dd>{buyer.status}</dd></div>}
          </dl>
          <section className="seller-buyer-profile__order">
            <h3>Related order</h3>
            <p>{booking.serviceTitle} · {booking.id}</p>
            <Link to={`/seller-dashboard/orders/${booking.id}`}>Open order details</Link>
          </section>
          <div className="seller-buyer-profile__report">
            <button className="button button--secondary" type="button" onClick={() => { setReportOpen((open) => !open); setError(""); }}>
              {reportOpen ? "Cancel report" : "Report account"}
            </button>
            {notice && <p className="ws-note" role="status">{notice}</p>}
            {reportOpen && <form className="seller-buyer-profile__form" onSubmit={submitReport}>
              <h3>Report this Buyer</h3>
              <label className="field">Reason<select className="field__control" value={reason} onChange={(event) => setReason(event.target.value)}>{REPORT_REASONS.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field">Details<textarea className="field__control" value={details} onChange={(event) => setDetails(event.target.value)} minLength={10} maxLength={1000} required placeholder="Describe the issue (10–1,000 characters)." /></label>
              {error && <p className="ws-alert" role="alert">{error}</p>}
              <p className="ws-note">This frontend demo stores the report in this browser only. It does not send the report to an Admin.</p>
              <button className="button button--primary" type="submit">Save local report</button>
            </form>}
          </div>
        </section>
      )}
    </SellerFrame>
  );
}

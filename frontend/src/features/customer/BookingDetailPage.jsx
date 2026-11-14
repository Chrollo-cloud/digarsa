import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../account/authContext.js";
import ContactCreator from "../messaging/ContactCreator";
import { bookingErrorMessage, completeBooking, createRevision, listRevisions, requestCancellation, respondToRevisionClarification } from "../bookings/bookingApi.js";
import { useBookingDetail } from "../bookings/useBookingList.js";
import { money } from "../../utils/money.js";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { bookingDate } from "./formatters";
import { bookingStatusDescription, bookingStatusLabel } from "./bookingLifecycle";

const canCancel = new Set(["Requested", "Accepted", "Paid", "Delivered"]);

export default function BookingDetailsPage() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const { user, logout } = useAuth();
  const resource = useBookingDetail("customer", bookingId, user?.id, logout);
  const booking = resource.booking;
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showCancellation, setShowCancellation] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [revisionText, setRevisionText] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [clarificationText, setClarificationText] = useState({});
  const [revisionError, setRevisionError] = useState("");
  const actionLock = useRef(false);
  const revisionBookingId = booking?.status === "Delivered" ? booking.id : "";

  const refreshRevisions = useCallback(async () => {
    if (!booking || booking.status !== "Delivered") return;
    try { setRevisions(await listRevisions(booking.id)); setRevisionError(""); }
    catch (error) {
      if (error?.status === 401) logout();
      setRevisionError(bookingErrorMessage(error));
    }
  }, [booking, logout]);
  useEffect(() => {
    if (!revisionBookingId) return undefined;
    let active = true;
    listRevisions(revisionBookingId).then((rows) => { if (active) setRevisions(rows); }).catch((error) => {
      if (active) setRevisionError(bookingErrorMessage(error));
      if (active && error?.status === 401) logout();
    });
    return () => { active = false; };
  }, [revisionBookingId, logout]);

  async function runAction(action) {
    if (!booking || actionLock.current) return;
    actionLock.current = true;
    setPending(true); setActionError(""); setActionMessage("");
    try {
      const result = await action();
      if (result?.status) setActionMessage(`Server recorded status: ${result.status}.`);
      else setActionMessage("Your request was recorded by the server.");
      resource.refresh();
      await refreshRevisions();
    } catch (error) {
      if (error?.status === 401) logout();
      setActionError(bookingErrorMessage(error));
    } finally { actionLock.current = false; setPending(false); }
  }

  async function submitCancellation(event) {
    event.preventDefault();
    if (!evidence) { setActionError("Attach the evidence file required for a cancellation request."); return; }
    await runAction(async () => {
      const result = await requestCancellation(booking.id, cancelReason, evidence);
      setShowCancellation(false); setCancelReason(""); setEvidence(null);
      return result;
    });
  }

  if (resource.status === "loading") return <CustomerFrame serverBacked title="Loading booking…"><p role="status" className="customer-empty">Loading the server record.</p></CustomerFrame>;
  if (resource.status === "error") return <CustomerFrame serverBacked title="Booking unavailable."><EmptyState title={resource.error} to="/orders" label="View my bookings" /><button className="market-reset" type="button" onClick={resource.refresh}>Try again</button></CustomerFrame>;
  if (!booking) return <CustomerFrame serverBacked title="Booking unavailable."><EmptyState title="This booking is not available to your account." to="/orders" label="View my bookings" /></CustomerFrame>;

  const cycle = booking.activeDeliveryCycle;
  return (
    <CustomerFrame serverBacked title="Your collaboration." description="Booking status and actions come from the Digarsa server.">
      <Link className="customer-back" to="/orders">← All bookings</Link>
      {params.has("submitted") && booking.status === "Requested" && <p role="status" className="customer-success">Your booking request was saved. No payment was made.</p>}
      {actionError && <p role="alert" className="customer-warning">{actionError}</p>}
      {actionMessage && <p role="status" className="customer-success">{actionMessage}</p>}
      <article className="customer-tracking">
        <header>
          <span className={`customer-status status-${booking.status.toLowerCase()}`}>{bookingStatusLabel(booking.status)}</span>
          <h2>{booking.serviceTitle}</h2><p>{booking.creatorName} · ID {booking.id}</p>
        </header>
        <p className="customer-info">{bookingStatusDescription(booking.status)}</p>
        <dl className="customer-tracking-facts">
          <div><dt>Starting estimate</dt><dd>{booking.estimatedPrice === null ? "Unavailable" : money(booking.estimatedPrice)}</dd></div>
          <div><dt>Payment status (server)</dt><dd>{booking.payment?.status || "No payment record"}</dd></div>
          <div><dt>Work mode</dt><dd>{booking.deliveryMode === "onsite" ? "On-site" : booking.deliveryMode === "remote" ? "Remote" : "Unavailable"}</dd></div>
          <div><dt>Requested date</dt><dd>{bookingDate(booking.requestedDate)}</dd></div>
          <div><dt>Submitted</dt><dd>{booking.createdAt ? new Date(booking.createdAt).toLocaleString("en-US") : "Unavailable"}</dd></div>
          {booking.deliveredAt && <div><dt>Delivered</dt><dd>{new Date(booking.deliveredAt).toLocaleString("en-US")}</dd></div>}
          {cycle?.review_deadline_at && <div><dt>Review deadline (server)</dt><dd>{new Date(cycle.review_deadline_at).toLocaleString("en-US")}</dd></div>}
          {cycle?.paused_at && <div><dt>Review timer</dt><dd>Paused by an active server workflow</dd></div>}
          {booking.location && <div><dt>Project location</dt><dd>{booking.location}</dd></div>}
        </dl>
        <h3>Project requirements</h3><p className="customer-preline">{booking.requirements}</p>
        <h3>Project description</h3><p className="customer-preline">{booking.description}</p>

        {booking.status === "Accepted" && <p className="customer-warning" role="status">Payment is not available in this integration. Do not treat this booking as paid.</p>}
        {booking.status === "Paid" && <p className="customer-info" role="status">The server reports this booking as paid. This screen cannot change payment status.</p>}
        {booking.status === "Delivered" && <section className="customer-delivery">
          <h3>Seller marked the work as delivered</h3>
          <p>The backend does not provide delivery files or notes in this booking contract.</p>
          <div className="customer-actions">
            <button className="button button--primary" type="button" disabled={pending} onClick={() => void runAction(() => completeBooking(booking.id))}>{pending ? "Updating…" : "Confirm completion"}</button>
          </div>
          <div className="customer-form">
            <label htmlFor="server-revision-request">Request a revision</label>
            <textarea id="server-revision-request" className="field__control" minLength={5} maxLength={1000} value={revisionText} onChange={(event) => setRevisionText(event.target.value)} />
            <button className="button button--secondary" type="button" disabled={pending || revisionText.trim().length < 5} onClick={() => void runAction(async () => { const result = await createRevision(booking.id, revisionText); setRevisionText(""); return result; })}>Send revision request</button>
          </div>
          {revisionError && <p className="customer-warning" role="alert">{revisionError}</p>}
          {!!revisions.length && <section><h3>Revision history</h3><ol>{revisions.map((revision) => <li key={revision.id}><strong>{revision.status}</strong><p>{revision.request_text}</p>{revision.seller_response_deadline_at && <small>Seller response deadline: {new Date(revision.seller_response_deadline_at).toLocaleString("en-US")}</small>}</li>)}</ol></section>}
          {revisions.flatMap((revision) => (revision.clarifications || []).filter((item) => item.requester_role === "SELLER" && item.status === "WAITING_CUSTOMER").map((item) => <form className="customer-form" key={item.id} onSubmit={(event) => { event.preventDefault(); void runAction(async () => { const result = await respondToRevisionClarification(booking.id, revision.id, item.id, clarificationText[item.id] || ""); setClarificationText((current) => ({ ...current, [item.id]: "" })); return result; }); }}>
            <h3>Formal revision clarification</h3><p>{item.request_text}</p><p>Reply due: {new Date(item.response_due_at).toLocaleString("en-US")}</p>
            <label className="field">Your response<textarea className="field__control" minLength={5} maxLength={1000} required value={clarificationText[item.id] || ""} onChange={(event) => setClarificationText((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
            <button className="button button--secondary" type="submit" disabled={pending || (clarificationText[item.id] || "").trim().length < 5}>{pending ? "Sending…" : "Send response"}</button>
          </form>))}
        </section>}

        {canCancel.has(booking.status) && <section className="customer-section">
          {!showCancellation ? <button className="button button--secondary" type="button" disabled={pending} onClick={() => setShowCancellation(true)}>Request cancellation</button> : <form className="customer-form" onSubmit={submitCancellation}>
            <h3>Cancellation request</h3><p>A reason and evidence file are required. An admin reviews the request; this action does not process a refund.</p>
            <label className="field">Reason<textarea className="field__control" minLength={10} maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required /></label>
            <label className="field">Evidence file<input type="file" required onChange={(event) => setEvidence(event.target.files?.[0] || null)} /></label>
            <button className="button button--primary" type="submit" disabled={pending || cancelReason.trim().length < 10}>{pending ? "Sending…" : "Submit request"}</button>
            <button className="button button--secondary" type="button" disabled={pending} onClick={() => setShowCancellation(false)}>Back</button>
          </form>}
        </section>}
        <Link to={`/service/${encodeURIComponent(booking.serviceId)}`}>View service</Link>
        <ContactCreator sellerProfileId={booking.sellerProfileId} serviceId={booking.serviceId} bookingId={booking.id} />
      </article>
    </CustomerFrame>
  );
}

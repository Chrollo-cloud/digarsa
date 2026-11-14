import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../account/authContext.js";
import { bookingErrorMessage, listSellerRevisions, respondToRevision, sellerDecision } from "../bookings/bookingApi.js";
import { useBookingDetail } from "../bookings/useBookingList.js";
import { money } from "../../utils/money.js";
import { bookingDate } from "../customer/formatters";
import { bookingLifecycle, bookingStatusDescription, bookingStatusLabel } from "../customer/bookingLifecycle";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";
import SellerFrame from "./SellerFrame";

export default function SellerOrderDetailsPage() {
  const { bookingId } = useParams();
  const { user, logout } = useAuth();
  const resource = useBookingDetail("seller", bookingId, user?.id, logout);
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [revisionInputs, setRevisionInputs] = useState({});
  const [revisionError, setRevisionError] = useState("");
  const actionLock = useRef(false);
  const booking = resource.booking;
  const sellerBookingId = booking?.id || "";

  const refreshRevisions = useCallback(async () => {
    if (!booking) return;
    try { setRevisions(await listSellerRevisions(booking.id)); setRevisionError(""); }
    catch (failure) { if (failure?.status === 401) logout(); setRevisionError(bookingErrorMessage(failure)); }
  }, [booking, logout]);
  useEffect(() => {
    if (!sellerBookingId) return undefined;
    let active = true;
    listSellerRevisions(sellerBookingId).then((rows) => { if (active) setRevisions(rows); }).catch((failure) => {
      if (active) setRevisionError(bookingErrorMessage(failure));
      if (active && failure?.status === 401) logout();
    });
    return () => { active = false; };
  }, [sellerBookingId, logout]);

  async function submitDecision(event) {
    event.preventDefault();
    if (!booking || !decision || actionLock.current) return;
    actionLock.current = true;
    setPending(true); setError(""); setSuccess("");
    try {
      const updated = await sellerDecision(booking, decision, reason);
      setSuccess(`Server recorded booking status: ${updated.status}.`);
      setDecision(""); setReason(""); resource.refresh();
    } catch (failure) {
      if (failure?.status === 401) logout();
      setError(bookingErrorMessage(failure));
    } finally { actionLock.current = false; setPending(false); }
  }

  async function submitRevisionResponse(event, revision) {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true;
    const input = revisionInputs[revision.id] || {};
    const action = input.action || "ACCEPT";
    const payload = action === "ACCEPT" ? { action, estimate_hours: Number(input.estimate_hours ?? 24) }
      : action === "REJECT" ? { action, reason: input.reason || "" }
        : { action, clarification_text: input.clarification_text || "" };
    setPending(true); setError(""); setSuccess("");
    try {
      const updated = await respondToRevision(booking.id, revision.id, payload);
      setRevisionInputs((current) => ({ ...current, [revision.id]: {} }));
      setSuccess(`Revision status recorded by server: ${updated.status}.`);
      await refreshRevisions(); resource.refresh();
    } catch (failure) {
      if (failure?.status === 401) logout();
      setError(bookingErrorMessage(failure));
    } finally { actionLock.current = false; setPending(false); }
  }

  if (resource.status === "loading") return <SellerFrame serverBacked title="Loading booking…"><p role="status" className="ws-notice">Loading the server record.</p></SellerFrame>;
  if (resource.status === "error") return <SellerFrame serverBacked title="Booking unavailable."><Empty title={resource.error}>Check the address or return to incoming bookings.</Empty><button type="button" className="location-link" onClick={resource.refresh}>Try again</button><Link className="ws-link" to="/seller-dashboard/orders">← Incoming bookings</Link></SellerFrame>;
  if (!booking) return <SellerFrame serverBacked title="Booking unavailable."><Empty title="This booking is not available to your seller account." /></SellerFrame>;
  const terminal = ["Declined", "Cancelled"].includes(booking.status);
  return (
    <SellerFrame serverBacked title="Booking details." description="Review the customer request and use server-supported actions.">
      <Link className="ws-back" to="/seller-dashboard/orders">← Incoming bookings</Link>
      {error && <p className="ws-alert" role="alert">{error}</p>}
      {success && <p className="ws-success" role="status">{success}</p>}
      <div className="ws-layout"><article className="ws-panel">
        <StatusBadge status={booking.status} /><h2>{booking.serviceTitle}</h2><p>ID {booking.id}</p>
        <ol className="ws-timeline" aria-label="Booking progress">
          {bookingLifecycle.map((status, index) => <li key={status} className={!terminal && index <= bookingLifecycle.indexOf(booking.status) ? "is-reached" : ""} aria-current={booking.status === status ? "step" : undefined}><span>{index + 1}</span><strong>{bookingStatusLabel(status)}</strong></li>)}
          {!bookingLifecycle.includes(booking.status) && <li aria-current="step"><span>•</span><strong>{bookingStatusLabel(booking.status)}</strong></li>}
        </ol>
        <p className="ws-note">{bookingStatusDescription(booking.status)}</p>
        <dl className="ws-facts">
          <div><dt>Customer account</dt><dd>Booking owner</dd></div>
          <div><dt>Starting estimate</dt><dd>{booking.estimatedPrice === null ? "Unavailable" : money(booking.estimatedPrice)}</dd></div>
          <div><dt>Payment status (server)</dt><dd>{booking.payment?.status || "No payment record"}</dd></div>
          <div><dt>Work mode</dt><dd>{booking.deliveryMode === "onsite" ? "On-site" : booking.deliveryMode === "remote" ? "Remote" : "Unavailable"}</dd></div>
          <div><dt>Requested date</dt><dd>{bookingDate(booking.requestedDate)}</dd></div>
          <div><dt>Submitted</dt><dd>{booking.createdAt ? dateTime(booking.createdAt) : "Unavailable"}</dd></div>
          {booking.location && <div><dt>Project location</dt><dd>{booking.location}</dd></div>}
        </dl>
        <h3>Project requirements</h3><p className="ws-preline">{booking.requirements}</p>
        <h3>Project description</h3><p className="ws-preline">{booking.description}</p>
        {booking.status === "Requested" && <section className="ws-section"><h3>Respond to request</h3>
          {!decision ? <div className="ws-actions"><button type="button" className="button button--primary" onClick={() => setDecision("accept")}>Accept request</button><button type="button" className="button button--danger" onClick={() => setDecision("decline")}>Decline request</button></div> : <form className="ws-form" onSubmit={submitDecision}>
            <p>{decision === "accept" ? "Accept the server estimate shown above. This action does not collect payment." : "Declining ends this booking request."}</p>
            {decision === "decline" && <label className="field">Reason (optional)<textarea className="field__control" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
            <div className="ws-actions"><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Saving…" : `Confirm ${decision}`}</button><button className="button button--secondary" type="button" disabled={pending} onClick={() => { setDecision(""); setReason(""); }}>Back</button></div>
          </form>}
        </section>}
        {booking.status === "Accepted" && <p className="ws-notice" role="status">Payment is not available in this integration. No delivery action is enabled.</p>}
        {booking.status === "Paid" && <p className="ws-notice" role="status">The server reports this booking as paid, but delivery submission is unavailable because the backend booking route has no delivery-content contract.</p>}
        {booking.status === "Delivered" && <p className="ws-notice" role="status">Work is marked delivered on the server. Review and completion are controlled by the customer and server lifecycle.</p>}
        {revisionError && <p className="ws-alert" role="alert">{revisionError}<button type="button" className="location-link" onClick={() => void refreshRevisions()}>Try again</button></p>}
        {!!revisions.length && <section className="ws-section"><h3>Revision requests</h3><ul className="ws-list">{revisions.map((revision) => <li className="ws-panel" key={revision.id}>
          <strong>{revision.status}</strong><p className="ws-preline">{revision.request_text}</p>
          <p>Seller response due: {new Date(revision.seller_response_deadline_at).toLocaleString("en-US")}</p>
          {revision.status === "REQUESTED" && <form className="ws-form" onSubmit={(event) => void submitRevisionResponse(event, revision)}>
            <label className="field">Response<select className="field__control" value={revisionInputs[revision.id]?.action || "ACCEPT"} onChange={(event) => setRevisionInputs((current) => ({ ...current, [revision.id]: { ...current[revision.id], action: event.target.value } }))}><option value="ACCEPT">Accept and start</option><option value="REJECT">Reject with reason</option><option value="REQUEST_CLARIFICATION">Ask for clarification</option></select></label>
            {(revisionInputs[revision.id]?.action || "ACCEPT") === "ACCEPT" && <label className="field">Estimated hours (0–72)<input className="field__control" type="number" min="0" max="72" value={revisionInputs[revision.id]?.estimate_hours ?? "24"} onChange={(event) => setRevisionInputs((current) => ({ ...current, [revision.id]: { ...current[revision.id], estimate_hours: event.target.value } }))} required /></label>}
            {(revisionInputs[revision.id]?.action === "REJECT") && <label className="field">Reason<textarea className="field__control" minLength={3} maxLength={1000} value={revisionInputs[revision.id]?.reason || ""} onChange={(event) => setRevisionInputs((current) => ({ ...current, [revision.id]: { ...current[revision.id], reason: event.target.value } }))} required /></label>}
            {(revisionInputs[revision.id]?.action === "REQUEST_CLARIFICATION") && <label className="field">Clarification<textarea className="field__control" minLength={5} maxLength={1000} value={revisionInputs[revision.id]?.clarification_text || ""} onChange={(event) => setRevisionInputs((current) => ({ ...current, [revision.id]: { ...current[revision.id], clarification_text: event.target.value } }))} required /></label>}
            <button className="button button--primary" type="submit" disabled={pending}>{pending ? "Sending…" : "Submit server response"}</button>
          </form>}
          {(revision.clarifications || []).filter((item) => item.requester_role === "CUSTOMER").map((item) => <p key={item.id}>Customer clarification ({item.status}): {item.request_text}{item.response_text ? ` — ${item.response_text}` : ""}</p>)}
        </li>)}</ul></section>}
      </article></div>
    </SellerFrame>
  );
}

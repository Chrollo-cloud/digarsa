import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../account/authContext.js";
import { bookingErrorMessage, createAdditionalRevisionOffer, deliverBooking, deliverDemoAdditionalWork, getDemoPaymentAvailability, listAdditionalRevisionRequests, listSellerRevisions, rejectAdditionalRevisionRequest, requestAdditionalRevisionClarification, respondToRevision, sellerDecision, startDemoAdditionalWork } from "../bookings/bookingApi.js";
import { runAdditionalRevisionRequestAction } from "./additionalRevisionAction.js";
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
  const [additionalRequests, setAdditionalRequests] = useState([]);
  const [additionalError, setAdditionalError] = useState("");
  const [additionalLoadedFor, setAdditionalLoadedFor] = useState("");
  const [additionalInputs, setAdditionalInputs] = useState({});
  const [demoPaymentEnabled, setDemoPaymentEnabled] = useState(false);
  const actionLock = useRef(false);
  const booking = resource.booking;
  const sellerBookingId = booking?.id || "";
  const additionalLoading = Boolean(sellerBookingId && additionalLoadedFor !== sellerBookingId);

  useEffect(() => {
    let active = true;
    getDemoPaymentAvailability().then((result) => { if (active) setDemoPaymentEnabled(result.enabled); }).catch(() => { if (active) setDemoPaymentEnabled(false); });
    return () => { active = false; };
  }, []);

  const refreshAdditional = useCallback(async () => {
    if (!booking) return;
    setAdditionalLoadedFor("");
    try { setAdditionalRequests(await listAdditionalRevisionRequests("seller", booking.id)); setAdditionalError(""); }
    catch (failure) { if (failure?.status === 401) logout(); setAdditionalError(bookingErrorMessage(failure)); }
    finally { setAdditionalLoadedFor(booking.id); }
  }, [booking, logout]);

  useEffect(() => {
    if (!sellerBookingId) return undefined;
    let active = true;
    listAdditionalRevisionRequests("seller", sellerBookingId).then((rows) => { if (active) setAdditionalRequests(rows); }).catch((failure) => {
      if (active) setAdditionalError(bookingErrorMessage(failure));
      if (active && failure?.status === 401) logout();
    }).finally(() => { if (active) setAdditionalLoadedFor(sellerBookingId); });
    return () => { active = false; };
  }, [sellerBookingId, logout]);

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
    event?.preventDefault?.();
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

  async function submitBookingDelivery() {
    if (!booking || actionLock.current) return;
    actionLock.current = true; setPending(true); setError(""); setSuccess("");
    try {
      const updated = await deliverBooking(booking.id);
      setSuccess(`Server recorded booking status: ${updated.status}.`);
      resource.refresh();
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

  async function submitAdditionalAction(event, request, action) {
    const input = additionalInputs[request.id] || {};
    return runAdditionalRevisionRequestAction({
      event,
      actionLock,
      bookingId: booking.id,
      requestId: request.id,
      action,
      input: action === "OFFER" ? {
        scope: input.scope || "", terms: input.terms || "", seller_price: Number(input.seller_price), estimated_duration_hours: Number(input.estimated_duration_hours),
      } : input,
      setPending,
      setError: setAdditionalError,
      setSuccess,
      resetInput: (requestId) => setAdditionalInputs((current) => ({ ...current, [requestId]: {} })),
      logout,
      formatError: bookingErrorMessage,
      refresh: refreshAdditional,
      actions: {
        createOffer: createAdditionalRevisionOffer,
        requestClarification: requestAdditionalRevisionClarification,
        rejectRequest: rejectAdditionalRevisionRequest,
      },
    });
  }

  async function runDemoWorkAction(request, action) {
    const agreement = request.agreement;
    if (!agreement || actionLock.current) return;
    actionLock.current = true; setPending(true); setAdditionalError(""); setSuccess("");
    try {
      if (action === "START") await startDemoAdditionalWork(booking.id, agreement.id);
      else await deliverDemoAdditionalWork(booking.id, agreement.id, additionalInputs[request.id]?.delivery_note || "");
      setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], delivery_note: "" } }));
      setSuccess("Demo-only additional-work status recorded. No payout was created.");
      await refreshAdditional(); resource.refresh();
    } catch (failure) { if (failure?.status === 401) logout(); setAdditionalError(bookingErrorMessage(failure)); }
    finally { actionLock.current = false; setPending(false); }
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
        {booking.status === "Paid" && <section className="ws-section"><h3>Booking delivery</h3><p className="ws-notice" role="status">{booking.payment?.provenance === "DEMO_SIMULATION" || booking.payment?.status === "DEMO_PAID" ? "DEMO PAYMENT — NO REAL TRANSACTION. The payment is simulated and cannot create payout eligibility." : "The server has confirmed payment. Delivery is recorded as a lifecycle status; attachable delivery content is not part of this route."}</p><button className="button button--primary" type="button" disabled={pending} onClick={() => void submitBookingDelivery()}>{pending ? "Saving…" : "Mark booking delivered"}</button></section>}
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
        <section className="ws-section" aria-labelledby="seller-additional-revision-title">
          <h3 id="seller-additional-revision-title">Paid additional work</h3>
          <p>Separate from the included free revision. Offers expire after 48 hours. Payment is not connected; an accepted agreement remains awaiting payment and no work can start.</p>
          {additionalLoading && <p className="ws-note" role="status">Loading additional-work history…</p>}
          {additionalError && <p className="ws-alert" role="alert">{additionalError}<button type="button" className="location-link" onClick={() => void refreshAdditional()}>Try again</button></p>}
          {!additionalLoading && !additionalRequests.length && !additionalError && <p className="ws-note">No additional-work requests.</p>}
          <ul className="ws-list">{additionalRequests.map((request) => <li className="ws-panel" key={request.id}>
            <strong>{request.status}</strong><p className="ws-preline">{request.description}</p>
            {request.history?.map((event, index) => <p key={`${event.occurred_at}-${index}`}><small>{event.event_type.replaceAll("_", " ")} · {dateTime(event.occurred_at)}</small>{typeof event.payload?.message === "string" && <span className="ws-preline">{event.payload.message}</span>}</p>)}
            {request.agreement && <div className="ws-notice" role="status"><p>Agreement {request.agreement.status}.</p>{request.agreement.status.startsWith("DEMO_") && <p>DEMO PAYMENT — NO REAL TRANSACTION. This simulated work creates no seller entitlement or payout.</p>}{request.agreement.status === "DEMO_FUNDED" && demoPaymentEnabled && <button className="button button--primary" type="button" disabled={pending} onClick={() => void runDemoWorkAction(request, "START")}>Start demo additional work</button>}{request.agreement.status === "DEMO_IN_PROGRESS" && demoPaymentEnabled && <form className="ws-form" onSubmit={(event) => { event.preventDefault(); void runDemoWorkAction(request, "DELIVER"); }}><label className="field">Delivery note<textarea className="field__control" minLength={5} maxLength={4000} value={additionalInputs[request.id]?.delivery_note || ""} onChange={(event) => setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], delivery_note: event.target.value } }))} required /></label><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Deliver demo work"}</button></form>}{request.agreement.status === "DEMO_IN_REVIEW" && <p>Customer review deadline: {request.agreement.review_deadline_at ? dateTime(request.agreement.review_deadline_at) : "not available"}</p>}{request.agreement.delivery_note && <p className="ws-preline">{request.agreement.delivery_note}</p>}</div>}
            {["OPEN", "OFFERED"].includes(request.status) && <form className="ws-form" onSubmit={(event) => void submitAdditionalAction(event, request, "OFFER")}>
              <h4>Versioned offer · seller price plus 5% Digarsa administration fee</h4>
              <label className="field">Work scope<textarea className="field__control" minLength={10} maxLength={4000} value={additionalInputs[request.id]?.scope || ""} onChange={(event) => setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], scope: event.target.value } }))} required /></label>
              <label className="field">Terms<textarea className="field__control" minLength={10} maxLength={4000} value={additionalInputs[request.id]?.terms || ""} onChange={(event) => setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], terms: event.target.value } }))} required /></label>
              <label className="field">Seller price (IDR)<input className="field__control" type="number" min="1" step="1" value={additionalInputs[request.id]?.seller_price || ""} onChange={(event) => setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], seller_price: event.target.value } }))} required /></label>
              <label className="field">Estimated duration (hours)<input className="field__control" type="number" min="1" step="1" value={additionalInputs[request.id]?.estimated_duration_hours || ""} onChange={(event) => setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], estimated_duration_hours: event.target.value } }))} required /></label>
              <p>The server calculates and stores the final administration fee and buyer total when you send this offer.</p>
              <button className="button button--primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Send offer (48 hours)"}</button>
            </form>}
            {request.status === "OPEN" && <div className="ws-actions">
              <form onSubmit={(event) => void submitAdditionalAction(event, request, "CLARIFY")}><label className="field">Ask for clarification<textarea className="field__control" minLength={5} maxLength={2000} value={additionalInputs[request.id]?.message || ""} onChange={(event) => setAdditionalInputs((current) => ({ ...current, [request.id]: { ...current[request.id], message: event.target.value } }))} /></label><button className="button button--secondary" type="submit" disabled={pending}>Request clarification</button></form>
              <button className="button button--danger" type="button" disabled={pending} onClick={() => void submitAdditionalAction(null, request, "REJECT")}>Reject request</button>
            </div>}
            {request.offers?.map((offer) => <p key={offer.id}>Offer v{offer.version}: seller {money(offer.seller_price)} + admin fee {money(offer.admin_fee)} = total {money(offer.buyer_total)} · {offer.status}</p>)}
          </li>)}</ul>
        </section>
      </article></div>
    </SellerFrame>
  );
}

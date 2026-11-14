import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../account/authContext.js";
import ContactCreator from "../messaging/ContactCreator";
import { acceptAdditionalRevisionOffer, bookingErrorMessage, completeBooking, completeDemoAdditionalWork, createAdditionalRevisionRequest, createRevision, getDemoPaymentAvailability, listAdditionalRevisionRequests, listRevisions, payAdditionalRevisionDemo, payBookingDemo, requestCancellation, respondToAdditionalRevisionClarification, respondToRevisionClarification, withdrawAdditionalRevisionRequest } from "../bookings/bookingApi.js";
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
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [additionalRequests, setAdditionalRequests] = useState([]);
  const [additionalError, setAdditionalError] = useState("");
  const [additionalLoadedFor, setAdditionalLoadedFor] = useState("");
  const [demoPaymentEnabled, setDemoPaymentEnabled] = useState(false);
  const actionLock = useRef(false);
  const revisionBookingId = booking?.status === "Delivered" ? booking.id : "";
  const additionalBookingId = booking?.id && ["PAID", "DEMO_PAID"].includes(booking.payment?.status) && ["Paid", "Delivered", "Completed"].includes(booking.status) ? booking.id : "";
  const additionalLoading = Boolean(additionalBookingId && additionalLoadedFor !== additionalBookingId);

  useEffect(() => {
    let active = true;
    getDemoPaymentAvailability().then((result) => { if (active) setDemoPaymentEnabled(result.enabled); }).catch(() => { if (active) setDemoPaymentEnabled(false); });
    return () => { active = false; };
  }, []);

  const refreshAdditional = useCallback(async () => {
    if (!additionalBookingId) return;
    setAdditionalLoadedFor("");
    try { setAdditionalRequests(await listAdditionalRevisionRequests("customer", additionalBookingId)); setAdditionalError(""); }
    catch (error) { if (error?.status === 401) logout(); setAdditionalError(bookingErrorMessage(error)); }
    finally { setAdditionalLoadedFor(additionalBookingId); }
  }, [additionalBookingId, logout]);

  useEffect(() => {
    if (!additionalBookingId) return undefined;
    let active = true;
    listAdditionalRevisionRequests("customer", additionalBookingId).then((rows) => { if (active) setAdditionalRequests(rows); }).catch((error) => {
      if (active) setAdditionalError(bookingErrorMessage(error));
      if (active && error?.status === 401) logout();
    }).finally(() => { if (active) setAdditionalLoadedFor(additionalBookingId); });
    return () => { active = false; };
  }, [additionalBookingId, logout]);

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
      await refreshAdditional();
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
          <div><dt>Seller price</dt><dd>{booking.sellerPrice === null ? "Unavailable" : money(booking.sellerPrice)}</dd></div>
          {booking.adminFee !== null && <div><dt>Digarsa administration fee</dt><dd>{money(booking.adminFee)}</dd></div>}
          {booking.buyerTotal !== null && <div><dt>Buyer total</dt><dd>{money(booking.buyerTotal)}</dd></div>}
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

        {booking.status === "Accepted" && <div className="customer-warning" role="status">{demoPaymentEnabled ? <><p>DEMO PAYMENT — NO REAL TRANSACTION</p><button className="button button--primary" type="button" disabled={pending || !Number.isSafeInteger(booking.buyerTotal)} onClick={() => void runAction(() => payBookingDemo(booking.id, booking.buyerTotal))}>{pending ? "Recording demo payment…" : `Record demo payment · ${money(booking.buyerTotal)}`}</button></> : "Payment is not available in this environment."}</div>}
        {booking.status === "Paid" && <p className="customer-info" role="status">{booking.payment?.provenance === "DEMO_SIMULATION" || booking.payment?.status === "DEMO_PAID" ? "DEMO PAYMENT — NO REAL TRANSACTION. This booking payment is simulated and creates no seller payout." : "The server reports this booking as paid. This screen cannot change payment status."}</p>}
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

        {additionalBookingId && <section className="customer-section" aria-labelledby="additional-revision-title">
          <h3 id="additional-revision-title">Additional work</h3>
          <p>This is separate from the included free revision. The seller sets the price; Digarsa’s 5% administration fee is added at the server.</p>
          {additionalLoading && <p className="customer-empty" role="status">Loading additional-work history…</p>}
          {additionalError && <p className="customer-warning" role="alert">{additionalError}<button type="button" className="market-reset" onClick={() => void refreshAdditional()}>Try again</button></p>}
          {additionalRequests.map((request) => <article className="customer-delivery" key={request.id}>
            <strong>{request.status}</strong><p className="customer-preline">{request.description}</p>
            {request.history?.map((event, index) => <p key={`${event.occurred_at}-${index}`}><small>{event.event_type.replaceAll("_", " ")}: {new Date(event.occurred_at).toLocaleString()}</small>{typeof event.payload?.message === "string" ? <span className="customer-preline">{event.payload.message}</span> : null}</p>)}
            {request.status === "CLARIFICATION_REQUIRED" && <form className="customer-form" onSubmit={(event) => { event.preventDefault(); void runAction(async () => { const updated = await respondToAdditionalRevisionClarification(booking.id, request.id, additionalDescription); setAdditionalDescription(""); return updated; }); }}>
              <label className="field">Reply to seller<textarea className="field__control" minLength={5} maxLength={2000} value={additionalDescription} onChange={(event) => setAdditionalDescription(event.target.value)} required /></label>
              <button className="button button--secondary" type="submit" disabled={pending || additionalDescription.trim().length < 5}>{pending ? "Sending…" : "Send clarification"}</button>
            </form>}
            {request.status === "OPEN" && <button type="button" className="button button--secondary" disabled={pending} onClick={() => void runAction(() => withdrawAdditionalRevisionRequest(booking.id, request.id))}>Withdraw request</button>}
            {request.offers?.filter((offer) => offer.status === "ACTIVE").map((offer) => <div className="customer-form" key={offer.id}>
              <h4>Seller offer · version {offer.version}</h4><p className="customer-preline">{offer.scope}</p><p className="customer-preline">{offer.terms}</p>
              <dl className="customer-tracking-facts"><div><dt>Seller price</dt><dd>{money(offer.seller_price)}</dd></div><div><dt>Digarsa administration fee (5%)</dt><dd>{money(offer.admin_fee)}</dd></div><div><dt>Total</dt><dd>{money(offer.buyer_total)}</dd></div><div><dt>Offer expires</dt><dd>{new Date(offer.expires_at).toLocaleString()}</dd></div></dl>
              <button className="button button--primary" type="button" disabled={pending || new Date(offer.expires_at).getTime() <= Date.now()} onClick={() => void runAction(() => acceptAdditionalRevisionOffer(booking.id, request.id, offer.id))}>Accept exact offer</button>
            </div>)}
            {request.agreement && <div role="status" className="customer-warning"><p>Agreement status: {request.agreement.status}.</p>{request.agreement.status === "AWAITING_PAYMENT" && demoPaymentEnabled && <><p>DEMO PAYMENT — NO REAL TRANSACTION</p><button className="button button--primary" type="button" disabled={pending} onClick={() => void runAction(() => payAdditionalRevisionDemo(booking.id, request.agreement.id, request.agreement.buyer_total))}>Record demo payment · {money(request.agreement.buyer_total)}</button></>}{request.agreement.status === "DEMO_IN_REVIEW" && <><p>{request.agreement.delivery_note}</p><p>Review by {request.agreement.review_deadline_at ? new Date(request.agreement.review_deadline_at).toLocaleString() : "not available"}.</p><button className="button button--primary" type="button" disabled={pending || !demoPaymentEnabled || !request.agreement.review_deadline_at || new Date(request.agreement.review_deadline_at) <= new Date()} onClick={() => void runAction(() => completeDemoAdditionalWork(booking.id, request.agreement.id))}>Approve demo delivery</button></>}{request.agreement.status.startsWith("DEMO_") && <small>Simulation only. No seller entitlement, refund, or payout is created.</small>}</div>}
          </article>)}
          {!additionalLoading && !additionalError && !additionalRequests.some((item) => ["OPEN", "CLARIFICATION_REQUIRED", "OFFERED"].includes(item.status) || ["AWAITING_PAYMENT", "FUNDED", "IN_PROGRESS", "DELIVERED", "IN_REVIEW", "DISPUTED", "CANCELLATION_PENDING", "DEMO_FUNDED", "DEMO_IN_PROGRESS", "DEMO_IN_REVIEW"].includes(item.agreement?.status)) && <form className="customer-form" onSubmit={(event) => { event.preventDefault(); void runAction(async () => { const result = await createAdditionalRevisionRequest(booking.id, additionalDescription); setAdditionalDescription(""); return result; }); }}>
            <label className="field">Describe the additional work<textarea className="field__control" minLength={10} maxLength={2000} value={additionalDescription} onChange={(event) => setAdditionalDescription(event.target.value)} required /></label>
            <button className="button button--secondary" type="submit" disabled={pending || additionalDescription.trim().length < 10}>{pending ? "Sending…" : "Ask for an additional-work offer"}</button>
          </form>}
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

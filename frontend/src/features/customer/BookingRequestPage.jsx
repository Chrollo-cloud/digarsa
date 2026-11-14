import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Input from "../../components/ui/Input";
import { money } from "../../utils/money.js";
import { usePublicCreator, usePublicService } from "../catalog/usePublicCatalog.js";
import { useAuth } from "../account/authContext.js";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { bookingErrorMessage, createBooking, validateBooking } from "../bookings/bookingApi.js";
import "./customer.css";

function earliestRequestedDate() { return new Date().toISOString().slice(0, 10); }

export default function BookingRequestPage() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const serviceResource = usePublicService(serviceId);
  const service = serviceResource.data;
  const creatorResource = usePublicCreator(service?.creatorId || "");
  const creator = creatorResource.data;
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  useEffect(() => { document.title = "Request a booking — Digarsa"; }, []);

  async function review(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const nextDraft = {
      requirements: values.requirements,
      description: values.description,
      requestedDate: values.requested_date || null,
      location: values.location || null,
    };
    setPending(true);
    setError("");
    try {
      const result = await validateBooking(service.id, nextDraft);
      setDraft(nextDraft);
      setValidation(result);
      setPolicyAcknowledged(false);
    } catch (failure) {
      if (failure?.status === 401) logout();
      setError(bookingErrorMessage(failure));
    } finally { setPending(false); }
  }

  async function confirm() {
    if (lock.current || pending || !policyAcknowledged || !validation) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const booking = await createBooking(service.id, draft, validation);
      navigate(`/orders/${encodeURIComponent(booking.id)}?submitted=1`, { replace: true });
    } catch (failure) {
      if (failure?.status === 401) logout();
      if (failure?.status === 0) setUncertain(true);
      setError(bookingErrorMessage(failure));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  if (serviceResource.status === "loading") return <CustomerFrame serverBacked title="Loading service…"><p role="status">Checking the current public service listing.</p></CustomerFrame>;
  if (serviceResource.status === "error" || !service) return <CustomerFrame serverBacked title="Service unavailable."><EmptyState title={serviceResource.error || "This service is not available."} to="/marketplace" label="Back to marketplace" /></CustomerFrame>;
  const onsite = service.delivery === "Onsite";
  return (
    <CustomerFrame serverBacked title="Start with a clear brief." description="The server checks current availability and saves your request." >
      <Link className="customer-back" to={`/service/${encodeURIComponent(service.id)}`}>Back to service</Link>
      {!service.bookable && <p className="customer-warning" role="status">This service is currently unavailable for booking. Choose another public service.</p>}
      <div className="customer-booking-layout">
        <section className="customer-form-panel">
          {!draft ? <form onSubmit={review}>
            <h2>Tell us about your project.</h2>
            <p>Describe the work. The seller will review this request before accepting it.</p>
            <label className="field">Project requirements<textarea className="field__control" name="requirements" required minLength={10} maxLength={2000} rows={4} /></label>
            <label className="field">Project description<textarea className="field__control" name="description" required minLength={20} maxLength={5000} rows={5} /></label>
            <Input label={`Requested date${onsite ? "" : " (optional)"}`} name="requested_date" type="date" min={earliestRequestedDate()} required={onsite} />
            {onsite && <Input label="Project location / address" name="location" required minLength={10} maxLength={500} />}
            <button type="submit" className="button button--primary" disabled={!service.bookable || pending}>{pending ? "Checking…" : "Review request"}</button>
          </form> : <div className="customer-confirmation">
            <h2>Review before sending.</h2>
            <dl>
              <dt>Service</dt><dd>{service.title}</dd>
              <dt>Seller</dt><dd>{creator?.name || service.creator?.name || "Creator"}</dd>
              <dt>Seller price</dt><dd>{money(validation.seller_price)}</dd>
              <dt>Digarsa administration fee (5%)</dt><dd>{money(validation.admin_fee)}</dd>
              <dt>Buyer total</dt><dd>{money(validation.buyer_total)}</dd>
              <dt>Delivery</dt><dd>{validation.delivery_mode === "onsite" ? "On-site" : "Remote"}</dd>
              <dt>Requested date</dt><dd>{draft.requestedDate || "Flexible"}</dd>
              {draft.location && <><dt>Location</dt><dd>{draft.location}</dd></>}
              <dt>Requirements</dt><dd>{draft.requirements}</dd>
              <dt>Description</dt><dd>{draft.description}</dd>
            </dl>
            <section className="customer-booking-policy">
              <h3>Revision policy</h3>
              <p>{validation.revision_policy.terms}</p>
              <p>{validation.revision_policy.free_revision_count} included revisions · request window {validation.revision_policy.request_window_duration} elapsed hours after server-recorded delivery.</p>
              <label><input type="checkbox" checked={policyAcknowledged} onChange={(event) => setPolicyAcknowledged(event.target.checked)} /> I have read and agree to this revision policy.</label>
            </section>
            <p>Submitting creates a <strong>Requested</strong> booking with this price snapshot. It does not charge you or confirm payment; checkout is not connected.</p>
            {uncertain && <p className="customer-warning" role="alert">The server may have received your request. Check <Link to="/orders">your booking list</Link> before trying again.</p>}
            <div className="customer-confirm-actions">
              <button type="button" className="button button--secondary" disabled={pending} onClick={() => { setDraft(null); setValidation(null); setError(""); setUncertain(false); }}>Edit request</button>
              {!uncertain && <button type="button" className="button button--primary" disabled={pending || !policyAcknowledged} onClick={() => void confirm()}>{pending ? "Submitting…" : "Confirm and submit request"}</button>}
            </div>
          </div>}
          {error && <p role="alert" className="customer-warning">{error}</p>}
        </section>
        <aside className="customer-form-panel">
          {service.image && <img className="customer-booking-service-image" src={service.image} alt={service.alt || service.title} />}
          <span className="market-kicker">SERVICE</span><h2>{service.title}</h2>
          <p>{creator?.name || service.creator?.name || "Creator"}</p>
          <p>{service.category} · {service.delivery}</p>
          <strong>{service.price === null ? "Price unavailable" : money(service.price)}</strong>
          {!user && <p role="status">Sign in to send a request.</p>}
        </aside>
      </div>
    </CustomerFrame>
  );
}

import { useCatalog } from "../catalog/useCatalog";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { services, getCreator, money } from "../../data/marketplace";
import Input from "../../components/ui/Input";
import { localToday } from "./customerStore";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingSummary from "./BookingSummary";
import { useCustomer } from "./useCustomer";
import { customerMessaging } from "../messaging/customerMessagingClient";

function BookingForm({ service, creator }) {
  const { user, store } = useCustomer();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const reviewHeading = useRef(null);
  const formHeading = useRef(null);
  const onsite = service.delivery.toLowerCase() === "onsite";
  function review(event) {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      store.validateBooking(service.id, values);
      setDraft(values);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  function confirm() {
    if (locked.current) return;
    locked.current = true;
    try {
      const booking = store.createBooking(service.id, draft, {
        confirmed: true,
        expectedUserId: user.id,
      });
      let notificationWarning = false;
      try {
        customerMessaging.notifyRequested(booking.id);
      } catch {
        notificationWarning = true;
      }
      navigate(`/orders/${booking.id}?submitted=1`, {
        replace: true,
        state: { notificationWarning },
      });
    } catch (failure) {
      locked.current = false;
      setError(failure.message);
    }
  }
  return (
    <div className="customer-booking-layout">
      <section className="customer-form-panel">
        <form onSubmit={review} hidden={!!draft}>
          <h2 tabIndex={-1} ref={formHeading}>
            Tell us about your project.
          </h2>
          <p>
            Describe what you need so the creator can understand your project.
          </p>
          <label className="field">
            Project requirements
            <textarea
              className="field__control"
              name="requirements"
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              placeholder="Deliverables, format, and key requirements…"
            />
          </label>
          <label className="field">
            Project description
            <textarea
              className="field__control"
              name="description"
              required
              minLength={20}
              maxLength={5000}
              rows={5}
              placeholder="Describe your goals, context, and creative direction…"
            />
          </label>
          <Input
            label={`Requested date${onsite || service.requiresSchedule ? "" : " (optional)"}`}
            name="requestedDate"
            type="date"
            min={localToday()}
            required={onsite || service.requiresSchedule === true}
          />
          {onsite && (
            <Input
              label="Project location / address"
              name="location"
              required
              minLength={10}
              maxLength={500}
            />
          )}
          <button type="submit" className="button button--primary">
            Review request
          </button>
        </form>
        {draft && (
          <div className="customer-confirmation">
            <h2
              tabIndex={-1}
              ref={(node) => {
                reviewHeading.current = node;
                node?.focus();
              }}
            >
              Review sebelum mengirim.
            </h2>
            <dl>
              <dt>Project requirements</dt>
              <dd>{draft.requirements}</dd>
              <dt>Description</dt>
              <dd>{draft.description}</dd>
              <dt>Date</dt>
              <dd>
                {draft.requestedDate || "Flexible, to be discussed with the creator"}
              </dd>
              {onsite && (
                <>
                  <dt>Location</dt>
                  <dd>{draft.location}</dd>
                </>
              )}
              <dt>Starting price estimate</dt>
              <dd>{money(service.price)}</dd>
            </dl>
            <p>
              By confirming, you submit a booking request with the status Awaiting Review. The seller has not accepted the project and no charge will be made.
            </p>
            <div className="customer-confirm-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setDraft(null);
                  setError("");
                  window.requestAnimationFrame(() =>
                    formHeading.current?.focus(),
                  );
                }}
              >
                Edit request
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={confirm}
              >
                Confirm and submit request
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="customer-warning">
            {error}
          </p>
        )}
      </section>
      <BookingSummary service={service} creator={creator} />
    </div>
  );
}
export default function BookingRequestPage() {
  useCatalog();
  const { serviceId } = useParams();
  const { user, store } = useCustomer();
  const service = services.find((item) => item.id === serviceId);
  const creator = service && getCreator(service.creatorId);
  const reason = store.getBookingRestriction(serviceId);
  const demoSeller = service && store.getDemoBookingSellerProfile(service.id);
  return (
    <CustomerFrame
      title="Start with a clear brief."
      description="Request a service, lalu tunggu tinjauan kreator."
    >
      <Link
        className="customer-back"
        to={service ? `/service/${service.id}` : "/marketplace"}
      >
        Back to {service ? "service" : "marketplace"}
      </Link>
      {reason ? (
        <EmptyState title={reason}>
          Select another available service to start a collaboration.
        </EmptyState>
      ) : (
        <>
          {demoSeller && <p className="customer-warning">This editorial sample is booked through the demo Seller account {demoSeller.name}. The sample creator is not represented as verified.</p>}
          <BookingForm
            key={`${user.id}-${service.id}`}
            service={service}
            creator={creator}
          />
        </>
      )}
    </CustomerFrame>
  );
}

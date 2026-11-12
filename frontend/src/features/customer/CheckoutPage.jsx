import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { services, creators, money } from "../../data/marketplace";
import { useCatalog } from "../catalog/useCatalog";
import { customerMessaging } from "../messaging/customerMessagingClient";
import Input from "../../components/ui/Input";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";
import { localToday } from "./customerStore";
import { checkoutGroups, checkoutTotal, parseCheckout } from "./checkoutModel";
import "./checkout.css";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const { user } = useCustomer();
  let selection;
  try { selection = parseCheckout(params); }
  catch (failure) {
    return <CustomerFrame title="Review your selection."><EmptyState title={failure.message} to="/cart" label="Back to cart" /></CustomerFrame>;
  }
  return <CheckoutForm key={`${user.id}-${params}`} {...selection} />;
}
function CheckoutForm({ ids, checkoutId }) {
  useCatalog();
  const { user, store, bookings, error: storageError } = useCustomer();
  const [draft, setDraft] = useState(null);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState(null);
  const [notificationWarning, setNotificationWarning] = useState(false);
  const lock = useRef(false);
  const heading = useRef(null);
  const demoSellers = new Map(ids.map(id => [id, store.getDemoBookingSellerProfile(id)]).filter(([, seller]) => seller));
  const groupedServices = services.map(service => {
    const seller = demoSellers.get(service.id);
    return seller ? { ...service, creatorId: seller.id } : service;
  });
  const groupedCreators = [...creators, ...[...demoSellers.values()].map(seller => ({ ...seller, demoFixture: true }))];
  const groups = checkoutGroups(ids, groupedServices, groupedCreators);
  const existing = bookings.filter(row => row.checkoutId === checkoutId);
  const completed = result || (existing.length === ids.length && ids.every(id => existing.some(row => row.serviceId === id)) ? existing : null);

  function review(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const entries = ids.map(serviceId => ({ serviceId, input: Object.fromEntries(
        ["requirements", "description", "requestedDate", "location"].map(key => [key, form.get(`${serviceId}:${key}`) || ""])) }));
      entries.forEach(row => store.validateBooking(row.serviceId, row.input));
      setDraft(entries);
      setFailure("");
      window.requestAnimationFrame(() => heading.current?.focus());
    } catch (error) { setFailure(error.message); }
  }
  function confirm() {
    if (lock.current) return;
    lock.current = true;
    try {
      const saved = store.submitCheckout(draft, { checkoutId, confirmed: true, expectedUserId: user.id });
      let failed = false;
      for (const booking of saved) {
        if (booking.status !== "Requested") continue;
        try { customerMessaging.notifyRequested(booking.id); } catch { failed = true; }
      }
      setNotificationWarning(failed);
      setResult(saved);
      setFailure("");
    } catch (error) {
      setFailure(`${error.message} Before trying again, check your saved orders. Retry this checkout safely instead of creating a new one.`);
    } finally { lock.current = false; }
  }
  return (
    <CustomerFrame title={completed ? "Request sent." : "Plan each collaboration."}
      description="One service, one order. Each Seller sets the final price and makes an independent decision.">
      <Link className="customer-back" to="/cart">← Back to cart</Link>
      {completed ? <section className="checkout-seller" role="status">
        <h2>{completed.length} orders saved.</h2>
        <p>No payment has been made. The seller will review your request and confirm the final price.</p>
        {notificationWarning && <p className="customer-warning">Orders were saved, but some notifications could not be sent.
          <button type="button" className="location-link" onClick={confirm}>Retry notifications</button></p>}
        <ul>{completed.map(row => <li key={row.id}><Link to={`/orders/${row.id}`}>{row.serviceTitle} </Link></li>)}</ul>
        <Link className="button button--primary" to="/orders">View all orders</Link>
      </section> : <div className="checkout-layout">
        <form onSubmit={review} className="checkout-services">
          <fieldset disabled={!!storageError} hidden={!!draft}>
            {groups.map(group => <section className="checkout-seller" key={group.id}>
              <span className="market-kicker">SELLER</span><h2>{group.creator?.name || "Creator unavailable"}</h2>
              {group.creator?.demoFixture && <p className="customer-warning">Editorial service sample. This demo Seller account handles requests; this creator is not verified.</p>}
              {group.items.map(({ id, service }) => {
                const reason = store.getBookingRestriction(id);
                return <section className="checkout-brief" key={id}>
                  <h3>{service?.title || "Service unavailable"}</h3>
                  {reason ? <p className="customer-warning">{reason}</p> : <>
                    <p>Starting estimate {money(service.price)} · {service.delivery === "Onsite" ? "On-site" : "Remote"}</p>
                    <label className="field">Project requirements — {service.title}
                      <textarea className="field__control" name={`${id}:requirements`} required minLength={10} maxLength={2000} rows={3} />
                    </label>
                    <label className="field">Project description — {service.title}
                      <textarea className="field__control" name={`${id}:description`} required minLength={20} maxLength={5000} rows={4} />
                    </label>
                    <Input label={`Requested date — ${service.title}`} name={`${id}:requestedDate`}
                      type="date" required min={localToday()} />
                    {service.delivery.toLowerCase() === "onsite" && <Input label={`Project location — ${service.title}`}
                      name={`${id}:location`} required minLength={10} maxLength={500} />}
                  </>}
                </section>;
              })}
            </section>)}
            <button type="submit" className="button button--primary">Review seluruh permintaan </button>
          </fieldset>
          {draft && <section className="checkout-seller">
            <h2 ref={heading} tabIndex={-1}>Review before submitting.</h2>
            {draft.map(row => <section className="checkout-brief" key={row.serviceId}>
              <h3>{services.find(item => item.id === row.serviceId)?.title}</h3>
              <dl><dt>Requested date</dt><dd>{row.input.requestedDate}</dd>
                <dt>Requirements</dt><dd>{row.input.requirements}</dd>
                <dt>Description</dt><dd>{row.input.description}</dd>
                {row.input.location && <><dt>Project location</dt><dd>{row.input.location}</dd></>}
              </dl>
            </section>)}
            <p>All services are validated again when submitted. If storage fails, saved orders are preserved. No payment is processed automatically.</p>
            <div className="checkout-row-actions">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>Edit requirements</button>
              <button type="button" className="button button--primary" disabled={!!storageError} onClick={confirm}>Confirm {ids.length} requests</button>
            </div>
          </section>}
          {failure && <p role="alert" className="customer-warning">{failure}</p>}
        </form>
        <aside className="checkout-summary">
          <span className="market-kicker">CHECKOUT SUMMARY</span><h2>Room for ideas.</h2>
          <dl><div><dt>Separate orders</dt><dd>{ids.length}</dd></div>
            <div><dt>Estimated subtotal</dt><dd>{money(checkoutTotal(ids, services))}</dd></div></dl>
          <p>Each Seller sets the final price when accepting a request. There are no additional platform fees in this demo.</p>
        </aside>
      </div>}
    </CustomerFrame>
  );
}

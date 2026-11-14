import { Link } from "react-router-dom";
import Availability from "../../components/marketplace/Availability";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";
import "./checkout.css";

export default function CartPage() {
  const { savedItems, cartItems, savedActions } = useCustomer();
  const cart = savedItems.cart;
  async function remove(serviceId) {
    try { await savedActions.removeFromCart(serviceId); }
    catch { /* Store exposes the authoritative request error. */ }
  }
  return (
    <CustomerFrame serverBacked title="Cart servicesmu." description="A saved consideration list. It does not reserve service availability or create a booking.">
      {cart.status === "loading" && <p className="market-panel" role="status">Loading your cart…</p>}
      {cart.error && <div className="customer-warning" role="alert"><p>{cart.error.message}</p><button className="market-reset" type="button" onClick={() => void savedActions.refresh()}>Try again</button></div>}
      {cart.refreshError && <p className="customer-warning" role="alert">{cart.refreshError}</p>}
      {cart.status === "ready" && !cartItems.length && <EmptyState title="Your cart is empty.">Add a publicly listed service from its detail page to keep it in this account list.</EmptyState>}
      {!!cartItems.length && <section className="checkout-services" aria-label="Services saved in cart">
        <p className="customer-list-caption">{cart.total} services · one entry per service</p>
        {cartItems.map((item) => {
          const service = item.service;
          const isAvailable = item.available && service?.bookable;
          return <article className="checkout-cart-row" key={item.serviceId}>
            {service?.image && <img src={service.image} alt={service.alt || service.title} />}
            <div className="checkout-cart-info">
              {service ? <>
                <Availability value={service.availability} />
                <h2><Link to={`/service/${service.id}`}>{service.title}</Link></h2>
                <p>{service.creator?.name || "Creator unavailable"}{service.creator?.city ? ` · ${service.creator.city}` : ""}</p>
                <p role="status">{isAvailable ? "Currently publicly available" : "Currently unavailable for booking"}</p>
              </> : <><h2>Service unavailable.</h2><p>This saved item no longer has a public service listing.</p></>}
              <button className="location-link" type="button" disabled={Boolean(savedItems.pending[`cart:${item.serviceId}`])} onClick={() => void remove(item.serviceId)}>
                {savedItems.pending[`cart:${item.serviceId}`] ? "Removing…" : "Remove from cart"}
              </button>
            </div>
          </article>;
        })}
      </section>}
      {cart.hasMore && <div className="market-load-more"><button className="button button--secondary" type="button" disabled={cart.loadingMore} onClick={() => void savedActions.loadMore("cart")}>{cart.loadingMore ? "Loading…" : "Load more cart items"}</button></div>}
      {cart.refreshError && cart.hasMore && <p role="alert" className="customer-warning">{cart.refreshError}</p>}
    </CustomerFrame>
  );
}

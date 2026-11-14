import { Link } from "react-router-dom";
import { useCustomer } from "../../features/customer/useCustomer";

export default function CartLink({ onNavigate }) {
  const { user, savedItems } = useCustomer();
  const cart = savedItems.cart;
  const count = user && cart.status === "ready" ? cart.total : null;
  return (
    <Link className="navbar__cart" to={user ? "/cart" : "/login?returnTo=%2Fcart"}
      onClick={onNavigate} aria-label={count === null ? "Cart" : `Cart, ${count} services`}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M3 4h2l2.5 11h11l2-8H6M9 20h.01M18 20h.01" strokeLinecap="round" />
      </svg>
      {count > 0 && <small>{count}</small>}
      {(cart.error || cart.refreshError) && <span className="market-sr-only">Cart count unavailable</span>}
    </Link>
  );
}

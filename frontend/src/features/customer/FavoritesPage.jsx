import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import SavedServiceCard from "./SavedServiceCard";
import { useCustomer } from "./useCustomer";

export default function FavoritesPage() {
  const { savedItems, favoriteItems, savedActions } = useCustomer();
  const favorites = savedItems.favorites;
  async function remove(serviceId) {
    try { await savedActions.removeFavorite(serviceId); }
    catch { /* Store exposes the authoritative request error. */ }
  }
  return (
    <CustomerFrame serverBacked title="Your favorites, your choice." description="Services saved to your Digarsa account.">
      {favorites.status === "loading" && <p className="customer-panel" role="status">Loading your favorites…</p>}
      {favorites.error && <div className="customer-warning" role="alert"><p>{favorites.error.message}</p><button className="market-reset" type="button" onClick={() => void savedActions.refresh()}>Try again</button></div>}
      {favorites.refreshError && <p className="customer-warning" role="alert">{favorites.refreshError}</p>}
      {favorites.status === "ready" && !favoriteItems.length ? <EmptyState title="Save what inspires you.">Your saved services will appear here. Favorites are separate from your cart.</EmptyState> : null}
      {!!favoriteItems.length && <section className="saved-services" aria-label="Service favorit">
        <p className="customer-list-caption">{favorites.total} services saved</p>
        {favoriteItems.map((item) => <SavedServiceCard key={item.serviceId} id={item.serviceId} service={item.service} available={item.available} pending={Boolean(savedItems.pending[`favorites:${item.serviceId}`])} onRemove={remove} />)}
      </section>}
      {favorites.hasMore && <div className="market-load-more"><button className="button button--secondary" type="button" disabled={favorites.loadingMore} onClick={() => void savedActions.loadMore("favorites")}>{favorites.loadingMore ? "Loading…" : "Load more favorites"}</button></div>}
      {favorites.refreshError && favorites.hasMore && <p role="alert" className="customer-warning">{favorites.refreshError}</p>}
    </CustomerFrame>
  );
}

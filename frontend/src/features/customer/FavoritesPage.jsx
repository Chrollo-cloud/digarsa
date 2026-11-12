import { useState } from "react";
import { useCatalog } from "../catalog/useCatalog";
import { services } from "../../data/marketplace";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import SavedServiceCard from "./SavedServiceCard";
import { useCustomer } from "./useCustomer";

export default function FavoritesPage() {
  useCatalog();
  const { favorites, store } = useCustomer();
  const [error, setError] = useState("");
  function remove(id) {
    try { store.removeFavorite(id); setError(""); }
    catch (failure) { setError(failure.message); }
  }
  return (
    <CustomerFrame title="Your favorites, your choice." description="A collection of services to inspire your next creative step.">
      {error && <p className="customer-warning" role="alert">{error}</p>}
      {favorites.length ? (
        <section className="saved-services" aria-label="Service favorit">
          <p className="customer-list-caption">{favorites.length} services disimpan</p>
          {favorites.map((id) => <SavedServiceCard key={id} id={id} service={services.find((row) => row.id === id)} onRemove={remove} />)}
        </section>
      ) : <EmptyState title="Save what inspires you.">Use the Save button on services to collect your choices. Favorites are separate from your cart.</EmptyState>}
    </CustomerFrame>
  );
}

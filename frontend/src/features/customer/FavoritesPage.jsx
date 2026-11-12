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
    <CustomerFrame title="Favorite kamu, pilihanmu." description="Kumpulan layanan yang menginspirasi langkah kreatif berikutnya.">
      {error && <p className="customer-warning" role="alert">{error}</p>}
      {favorites.length ? (
        <section className="saved-services" aria-label="Favorite">
          <p className="customer-list-caption">{favorites.length} Favorite</p>
          {favorites.map((id) => <SavedServiceCard key={id} id={id} service={services.find((row) => row.id === id)} onRemove={remove} />)}
        </section>
      ) : <EmptyState title="Simpan yang menginspirasimu.">Gunakan tombol Simpan pada layanan untuk mengumpulkan pilihan. Favorit tetap terpisah dari keranjang.</EmptyState>}
    </CustomerFrame>
  );
}

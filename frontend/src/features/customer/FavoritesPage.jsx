import { useCatalog } from "../catalog/useCatalog";
import { services } from "../../data/marketplace";
import ServiceCard from "../../components/marketplace/ServiceCard";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";

export default function FavoritesPage() {
  useCatalog();
  const { favorites } = useCustomer();
  const saved = services.filter((service) => favorites.includes(service.id));
  return (
    <CustomerFrame
      title="Disimpan untuk nanti."
      description="Layanan favoritmu tetap mudah ditemukan, termasuk saat jadwal kreator sedang penuh."
    >
      {saved.length ? (
        <div className="customer-service-grid">
          {saved.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      ) : (
        <EmptyState title="Belum ada simpanan.">
          Jelajahi layanan kreatif, lalu simpan yang sesuai dengan idemu.
        </EmptyState>
      )}
    </CustomerFrame>
  );
}

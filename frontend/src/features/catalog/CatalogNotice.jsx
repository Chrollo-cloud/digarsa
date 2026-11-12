import { useLocation } from "react-router-dom";
import { useCatalog } from "./useCatalog";
import { applyCatalog } from "../seller/sellerClient";

export default function CatalogNotice() {
  const { pathname } = useLocation();
  const { error, hasValidCatalog } = useCatalog();
  const usesCatalog =
    ["/marketplace", "/favorites", "/cart"].includes(pathname) ||
    /^\/(service|seller|booking)\//.test(pathname);
  if (!error || !usesCatalog) return null;
  return (
    <div className="container">
      <section className="market-panel" role="alert">
        <strong>Katalog belum dapat diverifikasi.</strong>
        <p>
          {hasValidCatalog
            ? "Menampilkan salinan katalog terakhir yang berhasil dimuat; perubahan terbaru mungkin belum terlihat."
            : "Sign up awal belum mencakup perubahan seller atau moderasi yang dapat diverifikasi."}{" "}
          Booking dinonaktifkan sementara.
        </p>
        <p>{error} Data tersimpan tidak dihapus atau direset.</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={applyCatalog}
        >
          Coba muat ulang katalog
        </button>
      </section>
    </div>
  );
}

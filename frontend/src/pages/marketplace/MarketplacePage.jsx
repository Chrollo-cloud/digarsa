import { useCatalog } from "../../features/catalog/useCatalog";
import { useDeferredValue, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  services,
  getCreator,
  categories,
  locations,
} from "../../data/marketplace";
import ServiceCard from "../../components/marketplace/ServiceCard";
import Filters from "../../components/marketplace/Filters";
import { useReviews } from "../../features/reviews/useReviews";
import {
  reviewStore,
  summarizeReviews,
} from "../../features/reviews/reviewClient";
import "./marketplace.css";

export default function MarketplacePage() {
  useCatalog();
  const { data: verifiedReviews, error: reviewError } = useReviews(() =>
    reviewStore.listPublic(),
  );
  const reviewAverage = (id) =>
    summarizeReviews(
      (verifiedReviews || []).filter((row) => row.service_id === id),
    ).average ?? -1;
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(
    ["q", "category", "city", "min", "max", "availability", "sort"].map(
      (key) => [key, params.get(key) || ""],
    ),
  );
  const query = useDeferredValue(values.q);
  const searching = query !== values.q;
  useEffect(() => {
    document.title = "Marketplace — Digarsa";
  }, []);

  function update(key, value) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const badPrice =
    [values.min, values.max].some(
      (value) =>
        value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0),
    ) ||
    (values.min !== "" &&
      values.max !== "" &&
      Number(values.min) > Number(values.max));
  const invalid =
    badPrice ||
    (values.category && !categories.includes(values.category)) ||
    (values.city && !locations.includes(values.city)) ||
    (values.availability &&
      !["Open", "Full-book"].includes(values.availability)) ||
    (values.sort &&
      !["price-up", "price-down", "rating"].includes(values.sort));
  const results = invalid
    ? []
    : services
        .filter((service) => {
          const creator = getCreator(service.creatorId);
          const searchable =
            `${service.title} ${service.description} ${service.category} ${creator.name} ${creator.city} ${creator.skills.join(" ")}`.toLocaleLowerCase(
              "id",
            );
          return (
            searchable.includes(query.trim().toLocaleLowerCase("id")) &&
            (!values.category || values.category === service.category) &&
            (!values.city || values.city === creator.city) &&
            (!values.availability ||
              values.availability === service.availability) &&
            (values.min === "" || service.price >= Number(values.min)) &&
            (values.max === "" || service.price <= Number(values.max))
          );
        })
        .sort((a, b) =>
          values.sort === "price-up"
            ? a.price - b.price
            : values.sort === "price-down"
              ? b.price - a.price
              : values.sort === "rating"
                ? reviewAverage(b.id) - reviewAverage(a.id)
                : 0,
        );

  return (
    <div className="market-page">
      <section className="market-hero">
        <div className="market-shell">
          <span className="market-kicker">DIGARSA / MARKETPLACE</span>
          <h1>
            Temukan <em>talenta</em>
            <br />
            untuk ide besarmu.
          </h1>
          <p>Partner kreatif lokal untuk langkah berikutnya.</p>
          <form
            className="market-search"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="market-sr-only" htmlFor="service-search">
              Cari layanan, kreator, atau keahlian
            </label>
            <span aria-hidden="true">⌕</span>
            <input
              id="service-search"
              type="search"
              value={values.q}
              onChange={(event) => update("q", event.target.value)}
              placeholder="Cari layanan, kreator, atau keahlian…"
            />
            <button type="submit">Cari →</button>
          </form>
          <Link className="market-nearby-link" to="/nearby">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
            Temukan layanan di dekatmu <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <div className="market-shell market-discovery">
        <Filters values={values} update={update} reset={() => setParams({})} />
        <section aria-label="Hasil pencarian" aria-busy={searching}>
          <div className="market-results-head">
            <div>
              <span className="market-kicker">PILIHAN KREATIF</span>
              <h2>
                Layanan untukmu<span>.</span>
              </h2>
              <p role="status" aria-live="polite">
                {searching
                  ? "Mencari layanan…"
                  : `${results.length} layanan ditemukan`}
              </p>
            </div>
            <label>
              Urutkan
              <select
                value={values.sort}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="">Pilihan editor</option>
                <option value="price-up">Harga terendah</option>
                <option value="price-down">Harga tertinggi</option>
                <option value="rating">Rating terverifikasi tertinggi</option>
              </select>
            </label>
          </div>
          {reviewError && (
            <p className="market-demo-note" role="alert">
              Rating terverifikasi belum tersedia. {reviewError}
            </p>
          )}
          {invalid ? (
            <div className="market-panel" role="alert">
              <h3>Periksa filter pencarian.</h3>
              <p>
                Gunakan pilihan yang tersedia dan harga nonnegatif. Harga
                minimum tidak boleh melebihi maksimum.
              </p>
              <button
                type="button"
                className="market-reset"
                onClick={() => setParams({})}
              >
                Reset pencarian
              </button>
            </div>
          ) : results.length ? (
            <div className="market-service-grid">
              {results.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          ) : (
            <div className="market-panel">
              <h3>Belum ada layanan yang cocok.</h3>
              <p>
                Coba kata kunci lain atau perluas kategori, lokasi, dan rentang
                harga.
              </p>
              <button
                type="button"
                className="market-reset"
                onClick={() => setParams({})}
              >
                Lihat semua layanan
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

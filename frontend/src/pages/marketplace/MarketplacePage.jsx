import { useDeferredValue, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ServiceCard from "../../components/marketplace/ServiceCard";
import Filters from "../../components/marketplace/Filters";
import { usePublicCatalogFacets, usePublicServiceList } from "../../features/catalog/usePublicCatalog";
import "./marketplace.css";

const FILTER_KEYS = ["q", "category", "city", "min", "max", "availability", "sort"];

export default function MarketplacePage() {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || ""]));
  const search = useDeferredValue(values.q);
  const searching = search !== values.q;
  const facets = usePublicCatalogFacets();
  const minimum = values.min === "" ? undefined : Number(values.min);
  const maximum = values.max === "" ? undefined : Number(values.max);
  const invalidPrice = [minimum, maximum].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0))
    || (minimum !== undefined && maximum !== undefined && minimum > maximum);
  const invalidAvailability = values.availability && !["Open", "Full-book"].includes(values.availability);
  const invalidSort = values.sort && !["editor", "price-up", "price-down", "rating"].includes(values.sort);
  const invalid = invalidPrice || invalidAvailability || invalidSort;
  const filters = {
    q: search,
    category: values.category,
    city: values.city,
    min: values.min,
    max: values.max,
    availability: values.availability,
    sort: values.sort || "editor",
  };
  const catalog = usePublicServiceList(filters, !invalid);

  useEffect(() => { document.title = "Marketplace — Digarsa"; }, []);

  function update(key, value) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }

  return (
    <div className="market-page">
      <section className="market-hero">
        <div className="market-shell">
          <span className="market-kicker">DIGARSA / MARKETPLACE</span>
          <h1>Temukan <em>talenta</em><br />for your big ideas.</h1>
          <p>Local creative partners for your next step.</p>
          <form className="market-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label className="market-sr-only" htmlFor="service-search">Search services, creators, or skills</label>
            <span aria-hidden="true">⌕</span>
            <input id="service-search" type="search" maxLength={120} value={values.q} onChange={(event) => update("q", event.target.value)} placeholder="Search services, creators, or skills…" />
            <button type="submit">Search</button>
          </form>
        </div>
      </section>

      <div className="market-shell market-discovery">
        <Filters
          values={{ ...values, sort: values.sort || "editor" }}
          update={update}
          reset={() => setParams({})}
          categories={facets.categories}
          locations={facets.cities}
        />
        <section aria-label="Hasil pencarian" aria-busy={catalog.status === "loading" || searching}>
          <div className="market-results-head">
            <div>
              <span className="market-kicker">PILIHAN KREATIF</span>
              <h2>Services for you<span>.</span></h2>
              <p role="status" aria-live="polite">
                {searching ? "Searching services…" : catalog.status === "ready" ? `${catalog.total} services ditemukan` : catalog.status === "loading" ? "Loading services…" : "Services unavailable"}
              </p>
            </div>
            <label>
              Urutkan
              <select value={values.sort || "editor"} onChange={(event) => update("sort", event.target.value)}>
                <option value="editor">Recently added</option>
                <option value="price-up">Lowest price</option>
                <option value="price-down">Highest price</option>
                <option value="rating">Highest rated</option>
              </select>
            </label>
          </div>

          {facets.error && <p className="market-demo-note" role="status">Filter options could not be loaded. You can still search and browse services. <button type="button" className="market-reset" onClick={facets.retry}>Retry filter options</button></p>}
          {invalid ? (
            <div className="market-panel" role="alert">
              <h3>Periksa filter pencarian.</h3>
              <p>Prices must be whole nonnegative IDR amounts, with the minimum no higher than the maximum.</p>
              <button type="button" className="market-reset" onClick={() => setParams({})}>Reset filters</button>
            </div>
          ) : catalog.status === "loading" ? (
            <div className="market-panel" role="status">Loading publicly available services…</div>
          ) : catalog.status === "error" ? (
            <div className="market-panel" role="alert">
              <h3>Services could not be loaded.</h3>
              <p>{catalog.error}</p>
              <button type="button" className="market-reset" onClick={catalog.retry}>Try again</button>
            </div>
          ) : catalog.items.length ? (
            <>
              <div className="market-service-grid">
                {catalog.items.map((service) => <ServiceCard key={service.id} service={service} />)}
              </div>
              {catalog.moreError && <p className="market-demo-note" role="alert">More services could not be loaded. {catalog.moreError}</p>}
              {catalog.hasMore && <div className="market-load-more"><button className="button button--secondary" type="button" onClick={catalog.loadMore} disabled={catalog.loadingMore}>{catalog.loadingMore ? "Loading…" : "Load more services"}</button></div>}
            </>
          ) : (
            <div className="market-panel">
              <h3>No services match these filters.</h3>
              <p>Try another search or broaden the category, location, or price range.</p>
              <button type="button" className="market-reset" onClick={() => setParams({})}>Show all services</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

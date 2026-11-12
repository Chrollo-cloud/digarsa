import { useCatalog } from "../../features/catalog/useCatalog";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  services,
  getCreator,
  categories,
  locations,
} from "../../data/marketplace";
import ServiceCard from "../../components/marketplace/ServiceCard";
import Filters from "../../components/marketplace/Filters";
import { useReviews } from "../../features/reviews/useReviews";
import { useAuth } from "../../features/account/authContext";
import { useBuyerLocation } from "../../features/location/useBuyerLocation";
import {
  reviewStore,
  summarizeReviews,
} from "../../features/reviews/reviewClient";
import "./marketplace.css";

const SEARCH_HISTORY_LIMIT = 8;
function historyKey(userId) {
  return `digarsa.marketplace.search-history.v1:${userId || "guest"}`;
}
function readSearchHistory(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter((item) => typeof item === "string").slice(0, SEARCH_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}
const normalize = (value) => String(value || "").trim().toLocaleLowerCase("en-US");

export default function MarketplacePage() {
  useCatalog();
  const { user } = useAuth();
  const { location: buyerLocation } = useBuyerLocation();
  const searchHistoryStorageKey = historyKey(user?.id);
  const [historyState, setHistoryState] = useState(() => ({
    key: searchHistoryStorageKey,
    entries: readSearchHistory(searchHistoryStorageKey),
  }));
  const searchHistory = historyState.key === searchHistoryStorageKey
    ? historyState.entries
    : readSearchHistory(searchHistoryStorageKey);
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

  function rememberSearch() {
    const term = values.q.trim();
    if (!term) return;
    const next = [term, ...searchHistory.filter((item) => normalize(item) !== normalize(term))]
      .slice(0, SEARCH_HISTORY_LIMIT);
    setHistoryState({ key: searchHistoryStorageKey, entries: next });
    try {
      window.localStorage.setItem(searchHistoryStorageKey, JSON.stringify(next));
    } catch {
      // Search still works if browser storage is unavailable.
    }
  }

  function clearSearchHistory() {
    setHistoryState({ key: searchHistoryStorageKey, entries: [] });
    try {
      window.localStorage.removeItem(searchHistoryStorageKey);
    } catch {
      // Clearing the current view is still useful if storage is unavailable.
    }
  }

  const recommendations = useMemo(() => {
    const terms = [...new Set(searchHistory.flatMap((entry) => normalize(entry).split(/\s+/).filter((word) => word.length > 1)))];
    const city = normalize(buyerLocation?.city);
    if (!terms.length && !city) return [];
    return services
      .filter((service) => service.availability === "Open")
      .map((service) => {
        const creator = getCreator(service.creatorId);
        const haystack = normalize([
          service.title,
          service.description,
          service.category,
          creator?.name,
          creator?.city,
          ...(creator?.skills || []),
        ].join(" "));
        const searchScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
        const locationMatch = Boolean(city && normalize(creator?.city).includes(city));
        return { service, score: searchScore + (locationMatch ? 1 : 0), locationMatch };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.service.title.localeCompare(b.service.title, "en-US"))
      .slice(0, 4)
      .map((item) => item.service);
  }, [searchHistory, buyerLocation?.city]);

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
            for your big ideas.
          </h1>
          <p>Local creative partners for your next step.</p>
          <form
            className="market-search"
            role="search"
            onSubmit={(event) => { event.preventDefault(); rememberSearch(); }}
          >
            <label className="market-sr-only" htmlFor="service-search">
              Search services, kreator, atau keahlian
            </label>
            <span aria-hidden="true">⌕</span>
            <input
              id="service-search"
              type="search"
              value={values.q}
              onChange={(event) => update("q", event.target.value)}
              placeholder="Search services, creators, or skills…"
            />
            <button type="submit">Search </button>
          </form>
        </div>
      </section>
      <section className="market-shell market-recommendations" aria-labelledby="recommendations-title">
        <div className="market-recommendations__heading">
          <div>
            <span className="market-kicker">PERSONALIZED FOR YOU</span>
            <h2 id="recommendations-title">My Recommendations<span>.</span></h2>
            <p>
              {searchHistory.length && buyerLocation?.city
                ? `Based on your recent searches and saved area: ${buyerLocation.city}.`
                : searchHistory.length
                  ? "Based on services and skills in your recent searches."
                  : buyerLocation?.city
                    ? `Based on available services around your saved area: ${buyerLocation.city}.`
                    : "Search for services or save a city in your profile to get recommendations."}
            </p>
          </div>
          {searchHistory.length > 0 && (
            <button className="market-reset" type="button" onClick={clearSearchHistory}>Clear search history</button>
          )}
        </div>
        {recommendations.length ? (
          <div className="market-service-grid">
            {recommendations.map((service) => <ServiceCard key={service.id} service={service} />)}
          </div>
        ) : (
          <p className="market-recommendations__empty">
            Recommendations will appear here when your recent searches or saved area match currently available services.
          </p>
        )}
      </section>
      <div className="market-shell market-discovery">
        <Filters values={values} update={update} reset={() => setParams({})} />
        <section aria-label="Hasil pencarian" aria-busy={searching}>
          <div className="market-results-head">
            <div>
              <span className="market-kicker">PILIHAN KREATIF</span>
              <h2>
                Services for you<span>.</span>
              </h2>
              <p role="status" aria-live="polite">
                {searching
                  ? "Searching services…"
                  : `${results.length} services ditemukan`}
              </p>
            </div>
            <label>
              Urutkan
              <select
                value={values.sort}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="">Editor's picks</option>
                <option value="price-up">Lowest price</option>
                <option value="price-down">Highest price</option>
                <option value="rating">Rating terverifikasi tertinggi</option>
              </select>
            </label>
          </div>
          {reviewError && (
            <p className="market-demo-note" role="alert">
              Verified ratings are not available yet. {reviewError}
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
              <h3>Belum ada services yang cocok.</h3>
              <p>
                Coba kata kunci lain atau perluas kategori, lokasi, dan rentang
                harga.
              </p>
              <button
                type="button"
                className="market-reset"
                onClick={() => setParams({})}
              >
                Show semua services
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
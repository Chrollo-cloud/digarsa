import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { services, categories, money } from "../../data/marketplace";
import { demoStore } from "../account/demoStore";
import { useAuth } from "../account/authContext";
import { useCatalog } from "../catalog/useCatalog";
import { applyCatalog } from "../seller/sellerClient";
import DeviceLocationPanel from "./DeviceLocationPanel";
import { useDeviceLocation } from "./useDeviceLocation";
import { useBuyerLocation } from "./useBuyerLocation";
import { discoverServices } from "./discovery";
import "./location.css";
const LocationMap = lazy(() => import("./LocationMap"));
const BuyerLocationForm = lazy(() => import("./BuyerLocationForm"));

function NearbyWorkspace() {
  const { user, store } = useAuth();
  const device = useDeviceLocation(user?.id || "guest");
  const [picking, setPicking] = useState(false);
  const saved = useBuyerLocation();
  const health = useCatalog();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("");
  const [cityOverride, setCity] = useState(null),
    [mode, setMode] = useState("onsite");
  const [radius, setRadius] = useState("25"),
    [selected, setSelected] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const city =
    cityOverride ?? (mode === "onsite" && !device.point ? (saved.location?.city ?? "") : "");
  const origin = device.point || saved.location?.coordinates || null;
  let rows = [],
    error = "";
  try {
    if (saved.error) throw new Error(saved.error);
    rows = discoverServices({
      catalog: services,
      resolveSellerProfile: (id) => demoStore.getBookableSeller(id),
      catalogError:
        health.error ||
        (!health.hasValidCatalog ? "Katalog belum tersedia" : ""),
      mode,
      query,
      category,
      city,
      origin,
      radiusKm: mode === "onsite" && origin && radius ? Number(radius) : null,
    });
  } catch (failure) {
    error = failure.message;
  }
  const selectedId = rows.some((row) => row.id === selected)
    ? selected
    : rows[0]?.id || "";
  const active = rows.find((row) => row.id === selectedId);
  const pins = rows.filter((row) => row.coordinates);
  return (
    <div className="nearby-page">
      <header className="nearby-heading">
        <div>
          <span className="market-kicker">DIGARSA / JELAJAH LOKAL</span>
          <h1>
            Talenta di <em>sekitarmu.</em>
          </h1>
          <p>
            Temukan layanan kreatif dengan wilayah publik yang dipilih
            kreatornya.
          </p>
        </div>
        <Link className="button button--secondary" to="/marketplace">
          Semua marketplace ↗
        </Link>
      </header>
      <DeviceLocationPanel
        device={device}
        picking={picking}
        onPickToggle={() => { setMode("onsite"); setPicking(!picking); }}
        onClear={() => {
          device.controller.clear();
          setPicking(false);
          setCity("");
          if (user) store.clearBuyerLocation({ expectedUserId: user.id });
        }}
      />
      <div className={`nearby-controls${filtersOpen ? " is-expanded" : ""}`}>
        <label className="nearby-search">
          Cari layanan
          <input
            type="search"
            className="field__control"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nama layanan atau kreator…"
          />
        </label>
        <button
          className="nearby-filter-toggle"
          type="button"
          aria-controls="nearby-filter-fields"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          {filtersOpen ? "Tutup −" : "Filter +"}
        </button>
        <div id="nearby-filter-fields" className="nearby-filter-fields">
          <label>
            Kategori
            <select
              className="field__control"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Semua kategori</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Wilayah layanan
            <input
              className="field__control"
              value={city}
              maxLength={120}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Semua wilayah"
            />
          </label>
          <label>
            Radius garis lurus
            <select
              className="field__control"
              value={mode === "onsite" && origin ? radius : ""}
              disabled={!origin || mode === "remote"}
              onChange={(event) => setRadius(event.target.value)}
            >
              <option value="">Tanpa batas radius</option>
              <option value="5">5 km</option>
              <option value="25">25 km</option>
              <option value="100">100 km</option>
              <option value="500">500 km</option>
            </select>
          </label>
        </div>
      </div>
      <div className="nearby-context">
        <div className="nearby-mode" role="group" aria-label="Jenis layanan">
          <button
            type="button"
            aria-pressed={mode === "onsite"}
            onClick={() => setMode("onsite")}
          >
            Onsite / area lokal
          </button>
          <button
            type="button"
            aria-pressed={mode === "remote"}
            onClick={() => setMode("remote")}
          >
            Remote / daring
          </button>
        </div>
        {user ? (
          <button
            className="location-link"
            type="button"
            aria-expanded={locationOpen}
            onClick={() => setLocationOpen(!locationOpen)}
          >
            Pengaturan lokasi tersimpan ↗
          </button>
        ) : (
          <Link className="location-link" to="/login?returnTo=%2Fnearby">
            Masuk untuk menyimpan lokasi ↗
          </Link>
        )}
      </div>
      {locationOpen && user && (
        <Suspense fallback={<p role="status">Memuat pengaturan lokasi…</p>}>
          <BuyerLocationForm key={user.id} />
        </Suspense>
      )}
      <p className="nearby-disclaimer">
        {mode === "remote"
          ? "Layanan daring ditampilkan terpisah, tanpa pin atau peringkat jarak."
          : origin
            ? "Jarak dihitung di browser dari titik privatmu: perkiraan garis lurus, bukan jarak jalan atau waktu tempuh."
            : "Atur titik privat untuk jarak garis lurus. Kota tidak menentukan titik peta."}{" "}
        Pin dikonfirmasi kreator, bukan hasil verifikasi lapangan.
      </p>
      {error && (
        <div className="location-error" role="alert">
          {error} Hasil dan pin tidak ditampilkan agar data tidak menyesatkan.{" "}
          <button
            className="location-link"
            type="button"
            onClick={applyCatalog}
          >
            Coba muat ulang katalog
          </button>
        </div>
      )}
      <div className={`nearby-layout${mode === "remote" ? " is-remote" : ""}`}>
        <section className="nearby-results" aria-label="Hasil layanan">
          <header>
            <h2>
              Layanan pilihan<span>.</span>
            </h2>
            <p role="status">
              {rows.length} layanan · {pins.length} pin publik
            </p>
          </header>
          {!rows.length ? (
            <div className="nearby-empty">
              <span aria-hidden="true">⌖</span>
              <h3>
                {error
                  ? "Data belum dapat diverifikasi."
                  : "Belum ada layanan yang sesuai."}
              </h3>
              <p>
                {mode === "remote"
                  ? "Coba kategori atau kata pencarian lain."
                  : "Layanan onsite perlu dimiliki akun kreator aktif dan tersedia untuk booking. Tidak semua kreator memilih mempublikasikan pin."}
              </p>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setCity("");
                  setRadius("");
                }}
              >
                Reset filter
              </button>
            </div>
          ) : (
            <ol className="nearby-cards">
              {rows.map((row, index) => (
                <li
                  key={row.id}
                  className={row.id === selectedId ? "is-selected" : ""}
                >
                  <button
                    className="nearby-select"
                    type="button"
                    aria-pressed={row.id === selectedId}
                    aria-label={`Pilih ${row.title}`}
                    onClick={() => setSelected(row.id)}
                  >
                    <img
                      src={row.image}
                      alt={row.alt || `Contoh karya ${row.title}`}
                      loading="lazy"
                    />
                    <span>
                      <small>
                        {row.category} ·{" "}
                        {row.coordinates
                          ? `PIN ${pins.findIndex((pin) => pin.id === row.id) + 1}`
                          : "TANPA PIN"}
                      </small>
                      <strong>{row.title}</strong>
                      <span>
                        {row.sellerName} ·{" "}
                        {row.area || "Wilayah belum dibagikan"}
                      </span>
                      <span>
                        {row.distance !== null
                          ? `≈ ${row.distance.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km garis lurus`
                          : mode === "remote"
                            ? "Dikerjakan secara daring"
                            : "Jarak belum tersedia"}
                      </span>
                    </span>
                  </button>
                  <div className="nearby-card-footer">
                    <span>Mulai {money(row.price)}</span>
                    {row.coordinates && (
                      <a href="#nearby-map" onClick={() => setSelected(row.id)}>
                        Pin di peta ↑
                      </a>
                    )}
                    <Link to={`/service/${row.id}`}>Lihat layanan ↗</Link>
                  </div>
                  <span className="location-sr-only">Hasil {index + 1}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        {mode === "onsite" && (
          <section
            id="nearby-map"
            className="nearby-map-panel"
            aria-label="Peta dan layanan terpilih"
          >
            <Suspense fallback={<p role="status">Memuat peta interaktif…</p>}>
              <LocationMap
                center={origin}
                selection={picking ? origin : null}
                selectionLabel="Titik privat pencarian (bukan pin layanan publik)"
                focusId={selected}
                onPick={picking ? (point) => { device.controller.useManual(point); } : undefined}
                points={pins}
                selectedId={selectedId}
                onSelect={setSelected}
              />
            </Suspense>
            {!pins.length && (
              <p className="nearby-map-empty">
                Belum ada pin publik untuk hasil ini. Peta tetap bisa
                dijelajahi; lokasi kota tidak ditebak.
              </p>
            )}
            {active && (
              <div className="nearby-selection" aria-live="polite">
                <span>TERPILIH</span>
                <strong>{active.title}</strong>
                <p>
                  {active.coordinates
                    ? active.area
                    : "Kreator belum membagikan pin layanan ini."}
                </p>
                <Link to={`/service/${active.id}`}>Buka detail layanan ↗</Link>
              </div>
            )}
          </section>
        )}
      </div>
      <p className="nearby-footnote">
        Demo lokal · titik pencarian hanya untuk sesi ini kecuali disimpan secara eksplisit.
        Peta memerlukan internet dan tile OpenStreetMap; tidak ada pelacakan
        langsung, geocoding, atau sinkronisasi lintas perangkat.
      </p>
    </div>
  );
}
export default function NearbyServicesPage() {
  const { user } = useAuth();
  useEffect(() => {
    document.title = "Layanan Sekitar — Digarsa";
  }, []);
  return <NearbyWorkspace key={user?.id || "guest"} />;
}

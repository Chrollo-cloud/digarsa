import { categories, locations } from "../../data/marketplace";

export default function Filters({ values, update, reset }) {
  return (
    <aside className="market-filters market-panel" aria-label="Filter layanan">
      <h2>Filter</h2>
      <label>
        Kategori
        <select
          value={values.category}
          onChange={(event) => update("category", event.target.value)}
        >
          <option value="">Semua kategori</option>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <label>
        Lokasi
        <select
          value={values.city}
          onChange={(event) => update("city", event.target.value)}
        >
          <option value="">Semua lokasi</option>
          {locations.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Rentang harga (IDR)</legend>
        <label>
          Minimum
          <input
            inputMode="numeric"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={values.min}
            onChange={(event) => update("min", event.target.value)}
          />
        </label>
        <label>
          Maksimum
          <input
            inputMode="numeric"
            type="number"
            min="0"
            step="1"
            placeholder="Tanpa batas"
            value={values.max}
            onChange={(event) => update("max", event.target.value)}
          />
        </label>
      </fieldset>
      <label>
        Ketersediaan
        <select
          value={values.availability}
          onChange={(event) => update("availability", event.target.value)}
        >
          <option value="">Semua layanan</option>
          <option>Open</option>
          <option>Full-book</option>
        </select>
      </label>
      <button className="market-reset" type="button" onClick={reset}>
        Reset semua filter
      </button>
    </aside>
  );
}

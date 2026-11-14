import { categoryLabel } from "../../features/seller/categoryLabels";

export default function Filters({ values, update, reset, categories = [], locations = [] }) {
  return (
    <aside className="market-filters market-panel" aria-label="Service filters">
      <h2>Filters</h2>
      <label>
        Category
        <select
          value={values.category}
          onChange={(event) => update("category", event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>{categoryLabel(category)}</option>
          ))}
        </select>
      </label>
      <label>
        Location
        <select
          value={values.city}
          onChange={(event) => update("city", event.target.value)}
        >
          <option value="">All locations</option>
          {locations.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Price range (IDR)</legend>
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
          Maximum
          <input
            inputMode="numeric"
            type="number"
            min="0"
            step="1"
            placeholder="No limit"
            value={values.max}
            onChange={(event) => update("max", event.target.value)}
          />
        </label>
      </fieldset>
      <label>
        Availability
        <select
          value={values.availability}
          onChange={(event) => update("availability", event.target.value)}
        >
          <option value="">Any availability</option>
          <option value="Open">Available</option>
          <option value="Full-book">Fully booked</option>
        </select>
      </label>
      <button className="market-reset" type="button" onClick={reset}>
        Reset all filters
      </button>
    </aside>
  );
}

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "../account/authContext";
import { ACCOUNT_KEY } from "../account/demoStore";
import { getRegionOptions } from "../location/regionDirectory";
import { requestBrowserLocation } from "../location/locationModel";
import "../location/location.css";
import "./buyer-address-book.css";
const LocationMap = lazy(() => import("../location/LocationMap"));

const emptyAddress = () => ({
  id: "", recipientName: "", phone: "",
  province: { id: "", name: "" }, regency: { id: "", name: "" },
  district: { id: "", name: "" }, village: { id: "", name: "" },
  postalCode: "", street: "", houseNumber: "", rtRw: "", unit: "", landmark: "", isPrimary: false,
  coordinates: null,
});
const regionKey = (level, parent) => `${level}:${parent || "all"}`;

function useRegionList(level, parentId, retry) {
  const key = regionKey(level, parentId);
  const [result, setResult] = useState({ key: "", rows: [], loading: false, error: "" });
  useEffect(() => {
    if (level !== "provinces" && !parentId) return undefined;
    let active = true;
    getRegionOptions(level, parentId).then(
      (rows) => { if (active) setResult({ key, rows, loading: false, error: "" }); },
      (error) => { if (active) setResult({ key, rows: [], loading: false, error: error.message }); },
    );
    return () => { active = false; };
  }, [key, level, parentId, retry]);
  return result.key === key ? result : { key, rows: [], loading: level === "provinces" || Boolean(parentId), error: "" };
}

function regionOption(region, rows) {
  return rows.find((row) => row.id === region.id) || null;
}

function RegionSelect({ label, value, options, loading, error, disabled, onChange, onRetry, required = true }) {
  return (
    <label className="field buyer-address-field">
      {label}
      <select className="field__control" required={required} value={value.id} disabled={disabled || loading || !options.length} onChange={(event) => {
        const row = options.find((option) => option.id === event.target.value);
        onChange(row ? { id: row.id, name: row.name } : { id: "", name: "" });
      }}>
        <option value="">{loading ? "Loading regions…" : `Select ${label.toLowerCase()}`}</option>
        {options.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
      {error && <span className="buyer-address-region-error" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></span>}
    </label>
  );
}

export default function BuyerAddressBook() {
  const { user, store } = useAuth();
  const [initialState] = useState(() => {
    try { return { addresses: store.getShippingAddresses(), error: "" }; }
    catch (failure) { return { addresses: [], error: failure.message }; }
  });
  const [addresses, setAddresses] = useState(initialState.addresses);
  const [error, setError] = useState(initialState.error);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyAddress);
  const [retry, setRetry] = useState(0);
  const [picker, setPicker] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [accuracy, setAccuracy] = useState(null);
  const active = useRef(true);
  const request = useRef(0);
  const provinces = useRegionList("provinces", "", retry);
  const regencies = useRegionList("regencies", form.province.id, retry);
  const districts = useRegionList("districts", form.regency.id, retry);
  const villages = useRegionList("villages", form.district.id, retry);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      try { setAddresses(store.getShippingAddresses()); setError(""); }
      catch (failure) { setError(failure.message); }
    };
    const unsubscribe = store.subscribe(refresh);
    const onStorage = (event) => { if (!event.key || event.key === ACCOUNT_KEY) refresh(); };
    window.addEventListener("storage", onStorage);
    return () => { unsubscribe(); window.removeEventListener("storage", onStorage); };
  }, [store]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  }
  function resetLocationState() {
    request.current++;
    setLocating(false); setLocationError(""); setAccuracy(null);
  }
  function startNew() {
    resetLocationState();
    setForm({ ...emptyAddress(), isPrimary: addresses.length === 0 });
    setEditing(true); setError(""); setNotice("");
  }
  function editAddress(address) {
    resetLocationState();
    setForm({ ...address, province: { ...address.province }, regency: { ...address.regency }, district: { ...address.district }, village: { ...address.village }, coordinates: address.coordinates ? { ...address.coordinates } : null });
    setEditing(true); setError(""); setNotice("");
  }
  function cancelEditing() {
    resetLocationState();
    setEditing(false); setForm(emptyAddress()); setError("");
  }
  function pickPoint(point) {
    request.current++;
    setLocating(false); setLocationError(""); setAccuracy(null);
    setForm((current) => ({ ...current, coordinates: { lat: point.lat, lng: point.lng } }));
  }
  function clearPoint() {
    resetLocationState();
    setForm((current) => ({ ...current, coordinates: null }));
  }
  async function locate() {
    const ticket = ++request.current;
    setLocating(true); setLocationError("");
    try {
      const reading = await requestBrowserLocation(navigator.geolocation, { withAccuracy: true });
      if (!active.current || ticket !== request.current || store.current()?.id !== user.id) return;
      setForm((current) => ({ ...current, coordinates: { lat: reading.point.lat, lng: reading.point.lng } }));
      setAccuracy(reading.accuracy);
    } catch (failure) {
      if (active.current && ticket === request.current) setLocationError(failure.message);
    } finally {
      if (active.current && ticket === request.current) setLocating(false);
    }
  }
  function submit(event) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const saved = store.saveShippingAddress(form, { expectedUserId: user.id });
      resetLocationState(); setAddresses(saved); setEditing(false); setForm(emptyAddress()); setNotice("Address saved to this account in this browser.");
    } catch (failure) { setError(failure.message); }
  }
  function setPrimary(id) {
    setError(""); setNotice("");
    try { setAddresses(store.setPrimaryShippingAddress(id, { expectedUserId: user.id })); setNotice("Primary address updated."); }
    catch (failure) { setError(failure.message); }
  }
  function deleteAddress(address) {
    if (!window.confirm(`Delete the address for ${address.recipientName}?`)) return;
    setError(""); setNotice("");
    try { setAddresses(store.deleteShippingAddress(address.id, { expectedUserId: user.id })); setNotice("Address deleted."); }
    catch (failure) { setError(failure.message); }
  }

  return (
    <section className="buyer-address-book" aria-labelledby="buyer-address-title">
      <header className="buyer-address-book__heading">
        <div><span className="market-kicker">BUYER ACCOUNT</span><h2 id="buyer-address-title">My addresses</h2><p>Saved separately from your private marketplace search location. Stored in this browser account only.</p></div>
        {!editing && <button type="button" className="button button--primary" onClick={startNew}>Add address</button>}
      </header>
      {error && <p className="personal-feedback is-error" role="alert">{error}</p>}
      {notice && <p className="personal-feedback" role="status">{notice}</p>}
      {addresses.length ? <div className="buyer-address-list">
        {addresses.map((address) => <article className="buyer-address-card" key={address.id}>
          <div className="buyer-address-card__top"><div><strong>{address.recipientName}</strong><span>{address.phone}</span></div>{address.isPrimary && <span className="buyer-address-primary">Primary</span>}</div>
          <p>{address.street} No. {address.houseNumber}{address.rtRw ? `, RT/RW ${address.rtRw}` : ""}{address.unit ? `, ${address.unit}` : ""}</p>
          <p>{address.village.name}, {address.district.name}, {address.regency.name}, {address.province.name} {address.postalCode}</p>
          {address.landmark && <small>Landmark: {address.landmark}</small>}
          {address.coordinates && <small className="buyer-address-card__point">Titik peta: {address.coordinates.lat.toFixed(5)}, {address.coordinates.lng.toFixed(5)}</small>}
          <div className="buyer-address-card__actions">
            <button type="button" onClick={() => editAddress(address)}>Edit</button>
            {!address.isPrimary && <button type="button" onClick={() => setPrimary(address.id)}>Set as primary</button>}
            <button type="button" onClick={() => deleteAddress(address)}>Delete</button>
          </div>
        </article>)}
      </div> : <div className="buyer-address-empty"><h3>No saved addresses yet.</h3><p>Add an address to keep delivery details ready for checkout.</p></div>}

      {editing && <form className="buyer-address-form" onSubmit={submit}>
        <h3>{form.id ? "Edit address" : "New address"}</h3>
        <div className="buyer-address-grid">
          <label className="field buyer-address-field">Recipient name<input className="field__control" autoComplete="name" maxLength={100} required minLength={2} value={form.recipientName} onChange={(event) => change("recipientName", event.target.value)} /></label>
          <label className="field buyer-address-field">Recipient phone<input className="field__control" type="tel" autoComplete="tel" maxLength={25} required value={form.phone} onChange={(event) => change("phone", event.target.value)} placeholder="e.g. +62 812 3456 7890" /></label>
          <RegionSelect label="Province" value={form.province} options={provinces.rows} loading={provinces.loading} error={provinces.error} onRetry={() => setRetry((value) => value + 1)} onChange={(region) => setForm((current) => ({ ...current, province: region, regency: { id: "", name: "" }, district: { id: "", name: "" }, village: { id: "", name: "" }, postalCode: "" }))} />
          <RegionSelect label="City / regency" value={form.regency} options={regencies.rows} loading={regencies.loading} error={regencies.error} disabled={!form.province.id} onRetry={() => setRetry((value) => value + 1)} onChange={(region) => setForm((current) => ({ ...current, regency: region, district: { id: "", name: "" }, village: { id: "", name: "" }, postalCode: "" }))} />
          <RegionSelect label="District" value={form.district} options={districts.rows} loading={districts.loading} error={districts.error} disabled={!form.regency.id} onRetry={() => setRetry((value) => value + 1)} onChange={(region) => setForm((current) => ({ ...current, district: region, village: { id: "", name: "" }, postalCode: "" }))} />
          <RegionSelect label="Village / subdistrict" value={form.village} options={villages.rows} loading={villages.loading} error={villages.error} disabled={!form.district.id} onRetry={() => setRetry((value) => value + 1)} onChange={(region) => {
            const row = regionOption(region, villages.rows);
            setForm((current) => ({ ...current, village: region, postalCode: row?.postalCode || current.postalCode }));
          }} />
          <label className="field buyer-address-field">Postal code<input className="field__control" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" minLength={5} maxLength={5} required value={form.postalCode} onChange={(event) => change("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Five digits" /></label>
          <label className="field buyer-address-field">Street name<input className="field__control" autoComplete="address-line1" maxLength={160} minLength={2} required value={form.street} onChange={(event) => change("street", event.target.value)} /></label>
          <label className="field buyer-address-field">House number<input className="field__control" maxLength={20} required value={form.houseNumber} onChange={(event) => change("houseNumber", event.target.value)} /></label>
          <label className="field buyer-address-field">RT/RW (optional)<input className="field__control" maxLength={30} value={form.rtRw} onChange={(event) => change("rtRw", event.target.value)} placeholder="e.g. 02/05" /></label>
          <label className="field buyer-address-field">Block or unit (optional)<input className="field__control" maxLength={60} value={form.unit} onChange={(event) => change("unit", event.target.value)} placeholder="e.g. Block C, Unit 12" /></label>
          <label className="field buyer-address-field buyer-address-field--wide">Location landmark (optional)<input className="field__control" maxLength={160} value={form.landmark} onChange={(event) => change("landmark", event.target.value)} placeholder="Nearby place or directions" /></label>
        </div>
        <div className="buyer-address-location">
          <div className="location-form-actions">
            <button className="button button--secondary" type="button" onClick={locate} disabled={locating}>
              {locating ? "Meminta lokasi…" : "Gunakan lokasi perangkat"}
            </button>
            <button className="button button--secondary" type="button" aria-expanded={picker} onClick={() => setPicker(!picker)}>
              {picker ? "Sembunyikan peta" : "Pilih titik manual di peta"}
            </button>
            {form.coordinates && <button className="button button--secondary" type="button" onClick={clearPoint}>Hapus titik</button>}
          </div>
          {locationError && <p className="location-error" role="alert">{locationError}</p>}
          {accuracy !== null && <p role="status" className="buyer-address-note">Akurasi perkiraan ±{Math.round(accuracy).toLocaleString("id-ID")} meter. Posisi Wi-Fi desktop dapat meleset; koreksi titik di peta sebelum menyimpan.</p>}
          {form.coordinates && <p role="status" className="buyer-address-note">Titik dipilih: {form.coordinates.lat.toFixed(6)}, {form.coordinates.lng.toFixed(6)}. Tersimpan setelah kamu menekan Save address.</p>}
          <p className="location-caption">
            Tombol lokasi perangkat meminta izin melalui browser. Jika ditolak, titik tetap dapat dipilih manual di peta. Titik peta bersifat privat, hanya tersimpan bersama alamat ini di browser, dan tidak dikirim sebagai pin ke peta hasil.
          </p>
          {picker && <div className="location-picker">
            <p className="buyer-address-note">Klik peta atau geser pin untuk memilih titik. Tampilan awal Indonesia, bukan lokasi akunmu. Peta memakai layanan tile OpenStreetMap.</p>
            <Suspense fallback={<p role="status">Memuat peta…</p>}>
              <LocationMap onPick={pickPoint} center={form.coordinates} selection={form.coordinates} selectionLabel="Titik privat pilihan (bukan pin layanan publik)" />
            </Suspense>
          </div>}
        </div>
        <label className="buyer-address-primary-check"><input type="checkbox" checked={form.isPrimary} onChange={(event) => change("isPrimary", event.target.checked)} /> Set as my primary address</label>
        <p className="buyer-address-note">Region names and postal codes are provided by a public directory. Street and recipient details stay in this browser's local account storage.</p>
        {error && <p className="personal-feedback is-error" role="alert">{error}</p>}
        <div className="personal-form-actions"><button type="button" className="button button--secondary" onClick={cancelEditing}>Cancel</button><button type="submit" className="button button--primary">Save address</button></div>
      </form>}
    </section>
  );
}
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "../account/authContext";
import { useBuyerLocation } from "./useBuyerLocation";
import { parseCoordinates, requestBrowserLocation } from "./locationModel";
import "./location.css";
const LocationMap = lazy(() => import("./LocationMap"));

export default function BuyerLocationForm() {
  const { user, store } = useAuth();
  const saved = useBuyerLocation();
  const [city, setCity] = useState(saved.location?.city || "");
  const [lat, setLat] = useState(
    String(saved.location?.coordinates?.lat ?? ""),
  );
  const [lng, setLng] = useState(
    String(saved.location?.coordinates?.lng ?? ""),
  );
  const [source, setSource] = useState(saved.location?.source || "manual");
  const [consent, setConsent] = useState(saved.location?.consent || false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const active = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function manualPoint(point) {
    request.current++;
    setBusy(false);
    setLat(String(point.lat));
    setLng(String(point.lng));
    setSource("manual");
    setConsent(false);
  }
  async function locate() {
    const ticket = ++request.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const point = await requestBrowserLocation(navigator.geolocation);
      if (
        !active.current ||
        ticket !== request.current ||
        store.current()?.id !== user.id
      )
        return;
      setLat(String(point.lat));
      setLng(String(point.lng));
      setSource("geolocation");
      setConsent(false);
      setMessage(
        "Titik diperoleh. Belum disimpan; periksa dan setujui penyimpanan jika ingin menggunakannya.",
      );
    } catch (failure) {
      if (active.current && ticket === request.current)
        setError(failure.message);
    } finally {
      if (active.current && ticket === request.current) setBusy(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    request.current++;
    setBusy(false);
    setError("");
    setMessage("");
    try {
      const coordinates = parseCoordinates(lat, lng);
      store.updateBuyerLocation(
        {
          version: 1,
          city,
          coordinates,
          source: coordinates ? source : "city",
          consent: coordinates ? consent : false,
        },
        { expectedUserId: user.id },
      );
      setMessage("Lokasi privat tersimpan untuk akun ini.");
    } catch (failure) {
      setError(failure.message);
    }
  }
  function clear() {
    request.current++;
    setBusy(false);
    setError("");
    setMessage("");
    try {
      store.clearBuyerLocation({ expectedUserId: user.id });
      setCity("");
      setLat("");
      setLng("");
      setConsent(false);
      setMessage("Lokasi tersimpan dihapus dari akun ini.");
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <section className="buyer-location" aria-label="Lokasi privat akun">
      <h2>Lokasi pencarianmu.</h2>
      <p>
        Kota atau wilayah membantu menyaring hasil. Koordinat opsional hanya
        tersimpan pada akun demo ini dan tidak dipublikasikan sebagai lokasi
        rumah.
      </p>
      <form onSubmit={submit} noValidate>
        <label>
          Kota / wilayah
          <input
            className="field__control"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            maxLength={120}
            placeholder="Mis. Bandung"
          />
        </label>
        <div className="location-coordinate-fields">
          <label>
            Lintang privat
            <input
              className="field__control"
              inputMode="decimal"
              value={lat}
              onChange={(event) => {
                request.current++;
                setBusy(false);
                setLat(event.target.value);
                setSource("manual");
                setConsent(false);
              }}
            />
          </label>
          <label>
            Bujur privat
            <input
              className="field__control"
              inputMode="decimal"
              value={lng}
              onChange={(event) => {
                request.current++;
                setBusy(false);
                setLng(event.target.value);
                setSource("manual");
                setConsent(false);
              }}
            />
          </label>
        </div>
        <div className="location-form-actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={locate}
            disabled={busy}
          >
            {busy ? "Meminta lokasi…" : "Gunakan lokasi perangkat"}
          </button>
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={picker}
            onClick={() => setPicker(!picker)}
          >
            Pilih titik manual di peta
          </button>
        </div>
        <p className="location-caption">
          Tombol lokasi perangkat pada formulir ini meminta izin melalui browser.
          Jika ditolak, kota dan koordinat manual tetap dapat digunakan. Titik
          privat tidak dikirim sebagai pin ke peta hasil.
        </p>
        {picker && (
          <div className="location-picker">
            <p>
              Klik peta untuk memilih titik. Alternatif keyboard: isi lintang
              dan bujur di atas. Tampilan awal Indonesia, bukan lokasi akunmu.
              Peta memakai layanan tile OpenStreetMap.
            </p>
            <Suspense fallback={<p role="status">Memuat peta…</p>}>
              <LocationMap onPick={manualPoint} />
            </Suspense>
          </div>
        )}
        <label className="location-check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          Saya setuju menyimpan koordinat ini secara privat pada akun demo di
          browser ini.
        </label>
        {(error || saved.error) && (
          <p className="location-error" role="alert">
            {error || saved.error}
          </p>
        )}
        {message && (
          <p className="location-success" role="status">
            {message}
          </p>
        )}
        <div className="location-form-actions">
          <button className="button button--primary" type="submit">
            Simpan lokasi privat
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={clear}
          >
            Hapus lokasi tersimpan
          </button>
        </div>
      </form>
    </section>
  );
}

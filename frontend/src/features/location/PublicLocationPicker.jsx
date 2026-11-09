import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { parseCoordinates } from "./locationModel";
import "./public-location-picker.css";

const LocationMap = lazy(() => import("./LocationMap"));

export default function PublicLocationPicker({ initial, area, onConfirm, onCancel, returnFocusRef }) {
  const dialog = useRef(null);
  const [lat, setLat] = useState(initial?.lat?.toString() || "");
  const [lng, setLng] = useState(initial?.lng?.toString() || "");
  const [center, setCenter] = useState(initial);
  const [consent, setConsent] = useState(false);
  let point = null;
  let error = "";
  try {
    point = parseCoordinates(lat, lng);
  } catch (failure) {
    error = failure.message;
  }
  useEffect(() => {
    const opener = returnFocusRef.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [returnFocusRef]);
  function selectPoint(value) {
    setLat(String(value.lat));
    setLng(String(value.lng));
    setConsent(false);
  }
  return (
    <dialog className="public-location-picker" ref={dialog}
      aria-labelledby="public-location-title" aria-describedby="public-location-description"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target.tagName === "INPUT") event.preventDefault();
      }}>
      <header className="public-location-picker__header">
        <div>
          <span className="market-kicker">DIGARSA / LOKASI PUBLIK</span>
          <h2 id="public-location-title">Pilih titik layanan.</h2>
        </div>
        <button type="button" className="public-location-picker__close"
          aria-label="Batalkan pilihan lokasi" onClick={onCancel}>×</button>
      </header>
      <p id="public-location-description" className="public-location-picker__intro">
        Geser dan perbesar peta, lalu ketuk untuk memilih titik. Pin dapat digeser;
        koordinat di bawah juga dapat diubah dengan keyboard.
      </p>
      <div className="public-location-picker__map">
        <Suspense fallback={<p role="status">Memuat peta pilihan lokasi…</p>}>
          <LocationMap center={center} selection={point} onPick={selectPoint} />
        </Suspense>
      </div>
      <section className="public-location-picker__details" aria-label="Konfirmasi titik publik">
        <div className="public-location-picker__area">
          <span aria-hidden="true">⌖</span>
          <div><strong>{area.trim() || "Wilayah layanan belum diisi"}</strong>
            <p>Label wilayah diisi olehmu, bukan alamat hasil pencarian peta.</p></div>
        </div>
        <div className="location-coordinate-fields">
          <label>Lintang pilihan
            <input className="field__control" inputMode="decimal" value={lat}
              onChange={(event) => { setLat(event.target.value); setConsent(false); }} />
          </label>
          <label>Bujur pilihan
            <input className="field__control" inputMode="decimal" value={lng}
              onChange={(event) => { setLng(event.target.value); setConsent(false); }} />
          </label>
        </div>
        <div className="public-location-picker__preview">
          <p role="status">{error || (point ? "Titik draf dipilih. Belum disimpan atau dipublikasikan." : "Belum ada titik. Pilih pada peta atau isi kedua koordinat.")}</p>
          <button type="button" className="location-link" disabled={!point}
            onClick={() => setCenter({ ...point })}>Lihat titik di peta</button>
        </div>
        <label className="location-check">
          <input type="checkbox" checked={consent} disabled={!point}
            onChange={(event) => setConsent(event.target.checked)} />
          Saya mengonfirmasi titik ini boleh menjadi lokasi layanan publik.
        </label>
        <p className="public-location-picker__privacy">
          Jangan pilih alamat rumah pribadi. Pilihan hanya diterapkan ke formulir ini;
          simpan formulir untuk memublikasikannya. Lokasi privat pembeli tidak digunakan.
        </p>
        <footer className="public-location-picker__actions">
          <button type="button" className="button button--secondary" onClick={onCancel}>Batal</button>
          <button type="button" className="button button--aqua" disabled={!point || !consent}
            onClick={() => onConfirm(point)}>Konfirmasi titik publik ↗</button>
        </footer>
      </section>
    </dialog>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../account/authContext";
import { parseCoordinates } from "./locationModel";

const descriptions = {
  idle: "Mempersiapkan lokasi pencarian…",
  checking: "Memeriksa izin lokasi browser…",
  loading: "Mencari lokasi perangkat. Jika diminta, pilih izin pada browser.",
  denied: "Izin lokasi ditolak. Kamu tetap bisa menjelajah atau memilih titik manual. Untuk mengizinkan kembali, ubah izin lokasi situs pada pengaturan browser.",
  gesture: "Browser belum memberikan lokasi. Tekan Gunakan lokasi saya untuk memulai lewat tindakan langsung; browser tetap menentukan izin.",
  unavailable: "Posisi perangkat belum tersedia. Coba lagi atau gunakan titik manual.",
  unsupported: "Geolokasi tidak didukung pada browser atau konteks ini. Gunakan titik manual atau jelajahi wilayah layanan.",
  timeout: "Pencarian lokasi melewati batas waktu. Coba lagi dengan tombol di bawah atau pilih titik manual.",
  cleared: "Lokasi pencarian telah dibersihkan. Tidak ada permintaan lokasi baru otomatis.",
};

export default function DeviceLocationPanel({ device, onPickToggle, picking, onClear }) {
  const { user, store } = useAuth();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const busy = ["checking", "loading"].includes(device.status);
  const status = device.status === "ready" && device.point
    ? device.source === "manual"
      ? "Titik manual digunakan untuk sesi ini."
      : "Lokasi perangkat digunakan untuk sesi ini."
    : descriptions[device.status];

  function manual(event) {
    event.preventDefault();
    setError("");
    setFeedback("");
    try {
      const form = new FormData(event.currentTarget);
      const point = parseCoordinates(form.get("lat"), form.get("lng"));
      if (!point) throw new Error("Isi kedua koordinat untuk memilih titik.");
      device.controller.useManual(point);
    } catch (failure) {
      setError(failure.message);
    }
  }

  function save() {
    setError("");
    setFeedback("");
    try {
      if (!device.point) throw new Error("Pilih lokasi terlebih dahulu.");
      store.updateBuyerLocation({
        version: 1, city: "", coordinates: device.point,
        source: device.source, consent: true,
      }, { expectedUserId: user.id });
      setFeedback("Lokasi disimpan secara privat pada akun ini melalui persetujuan tombol simpan.");
    } catch (failure) {
      setError(failure.message);
    }
  }

  function clear() {
    setError("");
    setFeedback("");
    try {
      onClear();
      setFeedback("Lokasi sesi dan lokasi tersimpan akun ini telah dihapus.");
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <section className="device-location-panel" aria-label="Deteksi lokasi pencarian">
      <div>
        <span className="market-kicker">LOKASI PENCARIAN</span>
        <p role="status">{status}</p>
        {device.point && <p>Koordinat pilihan sesi: {device.point.lat.toFixed(6)}, {device.point.lng.toFixed(6)}. Belum disimpan kecuali melalui tombol simpan.</p>}
        {device.point && device.status !== "ready" && (
          <p>Titik sesi sebelumnya tetap digunakan sampai diganti atau dihapus.</p>
        )}
        {device.point && device.source === "geolocation" && <p role="status">
          {device.accuracy === null ? "Akurasi perangkat tidak dilaporkan." : `Akurasi perkiraan ±${Math.round(device.accuracy).toLocaleString("id-ID")} meter.`}
          {device.accuracy > 100 && " Titik ini masih kasar; koreksi manual sebelum menyimpan."}
        </p>}
        <small>Posisi desktop melalui Wi-Fi dapat meleset. Titik bukan alamat pasti; kamu dapat mencoba lagi atau mengoreksinya di peta.</small>
        <small>
          Lokasi tepat tidak disimpan otomatis. Peta berpusat pada titik pencarian;
          penyedia tile menerima wilayah tampilan, tanpa pin publik lokasi pembeli.
        </small>
      </div>
      <div className="location-form-actions">
        <button type="button" className="button button--aqua" disabled={busy}
          onClick={() => { setFeedback(""); void device.controller.retry(); }}>
          {busy ? "Mencari lokasi…" : (device.point ? "Coba lagi lokasi saya" : "Gunakan lokasi saya")}
        </button>
        <button type="button" className="location-link" onClick={clear}>Hapus lokasi</button>
        {device.point && (user ? (
          <button type="button" className="button button--secondary" onClick={save}>
            Simpan lokasi ini di akun
          </button>
        ) : (
          <Link className="location-link" to="/login?returnTo=%2Fnearby">Masuk untuk menyimpan lokasi</Link>
        ))}
      </div>
      <details>
        <summary>Pilih lokasi secara manual</summary>
        <form onSubmit={manual} noValidate>
          <div className="location-coordinate-fields">
            <label>Lintang sesi
              <input className="field__control" name="lat" key={`lat-${device.point?.lat}-${device.point?.lng}`} defaultValue={device.point?.lat ?? ""} inputMode="decimal" />
            </label>
            <label>Bujur sesi
              <input className="field__control" name="lng" key={`lng-${device.point?.lat}-${device.point?.lng}`} defaultValue={device.point?.lng ?? ""} inputMode="decimal" />
            </label>
          </div>
          <div className="location-form-actions">
            <button type="submit" className="button button--secondary">Gunakan titik manual</button>
            <button type="button" className="location-link" aria-pressed={picking} onClick={onPickToggle}>
              {picking ? "Batalkan pilihan peta" : "Pilih titik pada peta"}
            </button>
          </div>
          <p>Titik manual hanya untuk sesi ini, kecuali kamu menekan tombol simpan.</p>
        </form>
      </details>
      {picking && <p role="status">Klik peta untuk memilih titik pencarian. Koordinat tidak dipublikasikan sebagai pin.</p>}
      {error && <p className="location-error" role="alert">{error}</p>}
      {feedback && <p className="location-success" role="status">{feedback}</p>}
    </section>
  );
}

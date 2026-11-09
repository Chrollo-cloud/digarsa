import { useState } from "react";
import "./location.css";

export default function PublicLocationFields({ initial, inherit = false }) {
  const [visibility, setVisibility] = useState(
    initial?.visibility || (inherit ? "inherit" : "hidden"),
  );
  const [confirmed, setConfirmed] = useState(initial?.confirmed === true);
  return (
    <fieldset className="location-fields">
      <legend>Lokasi layanan publik (opsional)</legend>
      <p>
        Publikasikan wilayah layanan atau titik studio yang memang boleh
        terlihat publik. Jangan gunakan alamat rumah pribadi. Layanan Remote
        tidak diberi pin.
      </p>
      <label>
        Visibilitas lokasi
        <select
          name="locationVisibility"
          value={visibility}
          onChange={(event) => {
            setVisibility(event.target.value);
            setConfirmed(false);
          }}
          className="field__control"
        >
          {inherit && (
            <option value="inherit">Ikuti lokasi publik Seller Profile</option>
          )}
          <option value="hidden">Tidak tampilkan lokasi layanan</option>
          <option value="area">Tampilkan wilayah saja</option>
          <option value="pin">Tampilkan pin yang saya konfirmasi</option>
        </select>
      </label>
      {["area", "pin"].includes(visibility) && (
        <label>
          Wilayah layanan publik
          <input
            className="field__control"
            name="locationArea"
            defaultValue={initial?.area || ""}
            maxLength={120}
            placeholder="Mis. Bandung / area layanan studio"
          />
        </label>
      )}
      {visibility === "pin" && (
        <>
          <div className="location-coordinate-fields">
            <label>
              Lintang publik
              <input
                name="locationLat"
                className="field__control"
                inputMode="decimal"
                defaultValue={initial?.coordinates?.lat ?? ""}
                onChange={() => setConfirmed(false)}
              />
            </label>
            <label>
              Bujur publik
              <input
                name="locationLng"
                className="field__control"
                inputMode="decimal"
                defaultValue={initial?.coordinates?.lng ?? ""}
                onChange={() => setConfirmed(false)}
              />
            </label>
          </div>
          <label className="location-check">
            <input
              type="checkbox"
              name="locationConfirmed"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Saya mengonfirmasi titik ini sebagai lokasi layanan publik dan
            mengizinkan pin ditampilkan.
          </label>
        </>
      )}
      <small>
        Kota profil tetap tampil seperti sebelumnya. Pilihan ini mengatur area
        layanan dan pin. Kota tidak otomatis diubah menjadi koordinat. Mengubah
        ke wilayah saja atau tersembunyi menghapus pin dari pengaturan ini saat
        disimpan.
      </small>
    </fieldset>
  );
}

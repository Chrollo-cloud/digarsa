import { lazy, Suspense, useReducer, useRef, useState } from "react";
import { parseCoordinates } from "./locationModel";
import { createPublicLocationDraft, publicLocationDraftReducer } from "./publicLocationDraft";
import "./location.css";

const PublicLocationPicker = lazy(() => import("./PublicLocationPicker"));

export default function PublicLocationFields({ initial, inherit = false }) {
  const [draft, dispatch] = useReducer(publicLocationDraftReducer, null,
    () => createPublicLocationDraft(initial, inherit));
  const [picker, setPicker] = useState(false);
  const pickerTrigger = useRef(null);
  let point = null;
  try {
    point = parseCoordinates(draft.lat, draft.lng);
  } catch { /* Invalid drafts remain editable; the existing form validator rejects them. */ }

  return (
    <fieldset className="location-fields">
      <legend>Lokasi layanan publik (opsional)</legend>
      <p>Publikasikan wilayah layanan atau titik studio yang memang boleh terlihat publik.
        Jangan gunakan alamat rumah pribadi. Layanan Remote tidak diberi pin.</p>
      <label>Visibilitas lokasi
        <select name="locationVisibility" value={draft.visibility} className="field__control"
          onChange={(event) => dispatch({ type: "visibility", value: event.target.value })}>
          {inherit && <option value="inherit">Ikuti lokasi publik Seller Profile</option>}
          <option value="hidden">Tidak tampilkan lokasi layanan</option>
          <option value="area">Tampilkan wilayah saja</option>
          <option value="pin">Tampilkan pin yang saya konfirmasi</option>
        </select>
      </label>
      {["area", "pin"].includes(draft.visibility) && (
        <label>Wilayah layanan publik
          <input className="field__control" name="locationArea" value={draft.area}
            onChange={(event) => dispatch({ type: "area", value: event.target.value })}
            maxLength={120} placeholder="Mis. Bandung / area layanan studio" />
        </label>
      )}
      {draft.visibility === "pin" && (
        <>
          <button ref={pickerTrigger} type="button" className="button button--secondary" onClick={() => setPicker(true)}>
            Pilih lokasi layanan di peta ↗
          </button>
          <div className="location-coordinate-fields">
            <label>Lintang publik
              <input name="locationLat" className="field__control" inputMode="decimal"
                value={draft.lat} onChange={(event) => dispatch({ type: "coordinate", field: "lat", value: event.target.value })} />
            </label>
            <label>Bujur publik
              <input name="locationLng" className="field__control" inputMode="decimal"
                value={draft.lng} onChange={(event) => dispatch({ type: "coordinate", field: "lng", value: event.target.value })} />
            </label>
          </div>
          <label className="location-check">
            <input type="checkbox" name="locationConfirmed" checked={draft.confirmed}
              onChange={(event) => dispatch({ type: "confirmed", value: event.target.checked })} />
            Saya mengonfirmasi titik ini sebagai lokasi layanan publik dan mengizinkan pin ditampilkan.
          </label>
          {picker && (
            <Suspense fallback={<p role="status">Memuat pemilih lokasi…</p>}>
              <PublicLocationPicker initial={point} area={draft.area} returnFocusRef={pickerTrigger}
                onCancel={() => setPicker(false)}
                onConfirm={(selected) => {
                  dispatch({ type: "confirmPick", point: selected });
                  setPicker(false);
                }} />
            </Suspense>
          )}
        </>
      )}
      <small>Kota profil tetap tampil seperti sebelumnya. Pilihan ini mengatur area layanan dan pin.
        Kota tidak otomatis diubah menjadi koordinat. Mengubah ke wilayah saja atau tersembunyi
        menghapus pin dari pengaturan ini saat disimpan.</small>
    </fieldset>
  );
}

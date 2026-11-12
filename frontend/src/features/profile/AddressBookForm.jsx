
import { lazy, Suspense, useEffect, useState } from "react";
import Input from "../../components/ui/Input";
import {
  getSavedAddress,
  saveAddress,
  removeSavedAddress,
} from "./addressStore";
import { requestBrowserLocation } from "../location/locationModel";

const LocationMap = lazy(() => import("../location/LocationMap"));

const REGION_API =
  "https://www.emsifa.com/api-wilayah-indonesia/v2";

const EMPTY_ADDRESS = {
  label: "Rumah",
  recipientName: "",
  phone: "",
  provinceId: "",
  provinceName: "",
  regencyId: "",
  regencyName: "",
  districtId: "",
  districtName: "",
  villageId: "",
  villageName: "",
  postalCode: "",
  detail: "",
  coordinates: null,
  coordinatesConsent: false,
};

function readInitialAddress(userId) {
  try {
    const existing = getSavedAddress(userId);
    return {
      address: existing
        ? { ...EMPTY_ADDRESS, ...existing }
        : { ...EMPTY_ADDRESS },
      saved: Boolean(existing),
      error: "",
    };
  } catch (failure) {
    return {
      address: { ...EMPTY_ADDRESS },
      saved: false,
      error: failure.message,
    };
  }
}

async function fetchRegions(path, signal) {
  const response = await fetch(`${REGION_API}/${path}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error("Daftar wilayah gagal dimuat.");
  }

  const result = await response.json();

  if (!Array.isArray(result?.data)) {
    throw new Error("Format data wilayah tidak valid.");
  }

  return result.data;
}

function RegionSelect({
  id,
  label,
  value,
  items,
  loading,
  disabled,
  onChange,
}) {
  return (
    <label className="field" htmlFor={id}>
      {label}
      <select
        id={id}
        className="field__control"
        value={value}
        onChange={onChange}
        disabled={disabled || loading}
        required
      >
        <option value="">
          {loading ? "Memuat wilayah..." : `Pilih ${label}`}
        </option>

        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AddressBookForm({ user }) {
  const [initialAddress] = useState(() => readInitialAddress(user.id));
  const [form, setForm] = useState(initialAddress.address);

  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);

  const [loading, setLoading] = useState({
    provinces: true,
    regencies: false,
    districts: false,
    villages: false,
  });

  const [regionError, setRegionError] = useState("");
  const [error, setError] = useState(initialAddress.error);
  const [success, setSuccess] = useState("");
  const [saved, setSaved] = useState(initialAddress.saved);

  const [locationBusy, setLocationBusy] = useState(false);

  // Load provinces.
  useEffect(() => {
    const controller = new AbortController();

    fetchRegions("provinces.json", controller.signal)
      .then((data) => {
        setProvinces(data);
        setRegionError("");
      })
      .catch((failure) => {
        if (failure.name !== "AbortError") {
          setRegionError(
            "Provinsi gagal dimuat. Periksa koneksi internet dan muat ulang halaman.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading((previous) => ({
            ...previous,
            provinces: false,
          }));
        }
      });

    return () => controller.abort();
  }, []);

  // Load regencies based on selected province.
  useEffect(() => {
    if (!form.provinceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear dependent options when no parent region is selected.
      setRegencies([]);
      return;
    }

    const controller = new AbortController();

    setRegencies([]);
    setRegionError("");

    setLoading((previous) => ({
      ...previous,
      regencies: true,
    }));

    fetchRegions(
      `regencies/${encodeURIComponent(form.provinceId)}.json`,
      controller.signal,
    )
      .then(setRegencies)
      .catch((failure) => {
        if (failure.name !== "AbortError") {
          setRegionError("Kabupaten/kota gagal dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading((previous) => ({
            ...previous,
            regencies: false,
          }));
        }
      });

    return () => controller.abort();
  }, [form.provinceId]);

  // Load districts based on selected regency.
  useEffect(() => {
    if (!form.regencyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear dependent options when no parent region is selected.
      setDistricts([]);
      return;
    }

    const controller = new AbortController();

    setDistricts([]);
    setRegionError("");

    setLoading((previous) => ({
      ...previous,
      districts: true,
    }));

    fetchRegions(
      `districts/${encodeURIComponent(form.regencyId)}.json`,
      controller.signal,
    )
      .then(setDistricts)
      .catch((failure) => {
        if (failure.name !== "AbortError") {
          setRegionError("Kecamatan gagal dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading((previous) => ({
            ...previous,
            districts: false,
          }));
        }
      });

    return () => controller.abort();
  }, [form.regencyId]);

  // Load villages based on selected district.
  useEffect(() => {
    if (!form.districtId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear dependent options when no parent region is selected.
      setVillages([]);
      return;
    }

    const controller = new AbortController();

    setVillages([]);
    setRegionError("");

    setLoading((previous) => ({
      ...previous,
      villages: true,
    }));

    fetchRegions(
      `villages/${encodeURIComponent(form.districtId)}.json`,
      controller.signal,
    )
      .then(setVillages)
      .catch((failure) => {
        if (failure.name !== "AbortError") {
          setRegionError("Kelurahan/desa gagal dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading((previous) => ({
            ...previous,
            villages: false,
          }));
        }
      });

    return () => controller.abort();
  }, [form.districtId]);

  // General form input.
  function edit(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  // Selecting a different administrative area clears the old pin.
  function changeProvince(event) {
    const selected = provinces.find(
      (item) => item.id === event.target.value,
    );

    setForm((previous) => ({
      ...previous,
      provinceId: selected?.id || "",
      provinceName: selected?.name || "",
      regencyId: "",
      regencyName: "",
      districtId: "",
      districtName: "",
      villageId: "",
      villageName: "",
      postalCode: "",
      coordinates: null,
      coordinatesConsent: false,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  function changeRegency(event) {
    const selected = regencies.find(
      (item) => item.id === event.target.value,
    );

    setForm((previous) => ({
      ...previous,
      regencyId: selected?.id || "",
      regencyName: selected?.name || "",
      districtId: "",
      districtName: "",
      villageId: "",
      villageName: "",
      postalCode: "",
      coordinates: null,
      coordinatesConsent: false,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  function changeDistrict(event) {
    const selected = districts.find(
      (item) => item.id === event.target.value,
    );

    setForm((previous) => ({
      ...previous,
      districtId: selected?.id || "",
      districtName: selected?.name || "",
      villageId: "",
      villageName: "",
      postalCode: "",
      coordinates: null,
      coordinatesConsent: false,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  function changeVillage(event) {
    const selected = villages.find(
      (item) => item.id === event.target.value,
    );

    setForm((previous) => ({
      ...previous,
      villageId: selected?.id || "",
      villageName: selected?.name || "",
      postalCode: selected?.postal_code || "",
      coordinates: null,
      coordinatesConsent: false,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  // GPS: use the device location as the initial address point.
  async function useCurrentAddressLocation() {
    setLocationBusy(true);
    setError("");
    setSuccess("");

    try {
      const point = await requestBrowserLocation(
        navigator.geolocation,
      );

      setForm((previous) => ({
        ...previous,
        coordinates: point,
        coordinatesConsent: false,
      }));

      setSaved(false);

      setSuccess(
        "Lokasi perangkat ditemukan. Periksa dan geser pin pada peta sebelum menyimpan.",
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLocationBusy(false);
    }
  }

  // Map click or marker drag updates the selected address point.
  function pickAddressPoint(point) {
    setForm((previous) => ({
      ...previous,
      coordinates: {
        lat: Number(point.lat.toFixed(6)),
        lng: Number(point.lng.toFixed(6)),
      },
      coordinatesConsent: false,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  function changeCoordinateConsent(event) {
    setForm((previous) => ({
      ...previous,
      coordinatesConsent: event.target.checked,
    }));

    setSaved(false);
    setError("");
    setSuccess("");
  }

  function clearAddressPoint() {
    setForm((previous) => ({
      ...previous,
      coordinates: null,
      coordinatesConsent: false,
    }));

    setSaved(false);
    setError("");
    setSuccess("Titik koordinat alamat dihapus.");
  }

  // The administrative region is only an approximate map viewport.
  function getRegionCoordinates(region) {
    if (
      !region ||
      region.lat == null ||
      region.lng == null ||
      region.lat === "" ||
      region.lng === ""
    ) {
      return null;
    }

    const lat = Number(region.lat);
    const lng = Number(region.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return null;
    }

    return { lat, lng };
  }

  const selectedVillage = villages.find(
    (item) => item.id === form.villageId,
  );

  const selectedDistrict = districts.find(
    (item) => item.id === form.districtId,
  );

  const selectedRegency = regencies.find(
    (item) => item.id === form.regencyId,
  );

  const selectedProvince = provinces.find(
    (item) => item.id === form.provinceId,
  );

  const regionCenter =
    getRegionCoordinates(selectedVillage) ||
    getRegionCoordinates(selectedDistrict) ||
    getRegionCoordinates(selectedRegency) ||
    getRegionCoordinates(selectedProvince);

  // A saved/selected exact point takes priority over region center.
  const addressMapCenter = form.coordinates || regionCenter;

  const regionsBusy = Object.values(loading).some(Boolean);

  function save(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      saveAddress(user.id, form);
      setSaved(true);
      setSuccess("Alamat berhasil disimpan!");
    } catch (failure) {
      setError(failure.message);
    }
  }

  function removeAddress() {
    if (!window.confirm("Hapus alamat utama yang tersimpan?")) {
      return;
    }

    try {
      removeSavedAddress(user.id);
      setForm({ ...EMPTY_ADDRESS });
      setSaved(false);
      setError("");
      setSuccess("Alamat berhasil dihapus.");
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <section className="personal-card address-book-card">
      <div className="personal-card-heading">
        <div>
          <span className="market-kicker">ALAMAT PENERIMA</span>
          <h2>Alamat Saya</h2>
          <p>
            Simpan alamat utama untuk kebutuhan komunikasi dan pesanan.
          </p>
        </div>
      </div>

      {regionError && (
        <p className="personal-feedback is-error" role="alert">
          {regionError}
        </p>
      )}

      <form onSubmit={save}>
        <div className="address-form-grid">
          <Input
            label="Label alamat"
            name="label"
            value={form.label}
            onChange={edit}
            placeholder="Rumah / Kantor"
            maxLength={30}
            required
          />

          <Input
            label="Nama penerima"
            name="recipientName"
            value={form.recipientName}
            onChange={edit}
            placeholder="Nama lengkap penerima"
            maxLength={80}
            required
          />

          <Input
            label="Nomor telepon"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={edit}
            placeholder="08xxxxxxxxxx"
            maxLength={25}
            required
          />

          <RegionSelect
            id="address-province"
            label="Provinsi"
            value={form.provinceId}
            items={provinces}
            loading={loading.provinces}
            onChange={changeProvince}
          />

          <RegionSelect
            id="address-regency"
            label="Kabupaten / Kota"
            value={form.regencyId}
            items={regencies}
            loading={loading.regencies}
            disabled={!form.provinceId}
            onChange={changeRegency}
          />

          <RegionSelect
            id="address-district"
            label="Kecamatan"
            value={form.districtId}
            items={districts}
            loading={loading.districts}
            disabled={!form.regencyId}
            onChange={changeDistrict}
          />

          <RegionSelect
            id="address-village"
            label="Kelurahan / Desa"
            value={form.villageId}
            items={villages}
            loading={loading.villages}
            disabled={!form.districtId}
            onChange={changeVillage}
          />

          <Input
            label="Kode pos"
            name="postalCode"
            value={form.postalCode}
            onChange={edit}
            inputMode="numeric"
            maxLength={5}
            placeholder="Contoh: 81100"
            required
          />

          <label className="field address-form-full">
            Detail alamat
            <textarea
              className="field__control address-detail-control"
              name="detail"
              value={form.detail}
              onChange={edit}
              minLength={10}
              maxLength={500}
              rows={3}
              placeholder="Nama jalan, nomor rumah, RT/RW, blok, patokan, dan detail lainnya."
              required
            />
          </label>
        </div>

        {/* Map is always visible below the address fields. */}
        <section className="address-location-section">
          <div className="address-location-heading">
            <h3>Titik lokasi alamat</h3>
            <p>
              Peta mengikuti wilayah alamat yang kamu pilih.
              Gunakan GPS atau klik dan geser pin untuk
              menentukan lokasi rumah dengan lebih akurat.
            </p>
          </div>

          <div className="address-location-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={useCurrentAddressLocation}
              disabled={locationBusy}
            >
              {locationBusy
                ? "Mencari lokasi..."
                : "Gunakan lokasi saat ini"}
            </button>
          </div>

          <div className="address-location-map">
            <Suspense
              fallback={
                <p role="status">Memuat peta alamat...</p>
              }
            >
              <LocationMap
                points={[]}
                center={form.coordinates}
                viewCenter={addressMapCenter}
                centerLabel="Titik alamat penerima"
                onPick={pickAddressPoint}
              />
            </Suspense>
          </div>

          {form.coordinates ? (
            <>
              <div className="address-coordinate-preview">
                <span>Titik alamat terpilih</span>
                <strong>
                  {form.coordinates.lat.toFixed(6)},{" "}
                  {form.coordinates.lng.toFixed(6)}
                </strong>
              </div>

              <label className="location-check address-location-consent">
                <input
                  type="checkbox"
                  checked={form.coordinatesConsent}
                  onChange={changeCoordinateConsent}
                />
                Saya menyetujui penyimpanan koordinat titik
                alamat ini secara privat pada akun demo.
              </label>

              <button
                type="button"
                className="button button--secondary"
                onClick={clearAddressPoint}
              >
                Hapus titik koordinat
              </button>
            </>
          ) : (
            <p className="address-data-note">
              Peta mengikuti pusat wilayah administratif.
              Belum ada titik rumah yang dipilih. Klik peta
              untuk menempatkan pin.
            </p>
          )}
        </section>

        <p className="address-data-note">
          Data alamat disimpan secara privat pada browser akun
          demo ini. Alamat rumah tidak dipublikasikan ke profil
          atau peta Marketplace.
        </p>

        {error && (
          <p className="personal-feedback is-error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="personal-feedback" role="status">
            {success}
          </p>
        )}

        <div className="personal-form-actions">
          <p>
            {saved
              ? "Alamat utama kamu sudah tersimpan."
              : "Lengkapi alamat penerima dengan benar."}
          </p>

          <div className="address-form-buttons">
            {saved && (
              <button
                type="button"
                className="button button--secondary"
                onClick={removeAddress}
                disabled={regionsBusy || locationBusy}
              >
                Hapus Alamat
              </button>
            )}

            <button
              type="submit"
              className="button button--primary"
              disabled={
                regionsBusy ||
                locationBusy
              }
            >
              Simpan Alamat
            </button>
          </div>
        </div>

        <p className="address-source-note">
          Data wilayah:{" "}
          <a
            href="https://www.emsifa.com/api-wilayah-indonesia/"
            target="_blank"
            rel="noreferrer"
          >
            API Wilayah Indonesia
          </a>.
        </p>
      </form>
    </section>
  );
}

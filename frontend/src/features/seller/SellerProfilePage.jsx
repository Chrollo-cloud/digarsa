import PhotoEditor from "../media/PhotoEditor";
import { useState } from "react";
import PublicLocationFields from "../location/PublicLocationFields";
import { publicLocationFromForm } from "../location/locationModel";
import { Link } from "react-router-dom";
import Input from "../../components/ui/Input";
import { sellerCategories } from "../account/demoStore";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import "./sellerProfile.css";

const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_BLOB_SIZE = 180 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 250_000;

async function compressSellerImage(file) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Gunakan gambar JPG, PNG, atau WEBP.");
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error("Ukuran gambar maksimal 5 MB.");
  }

  let bitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("File gambar tidak dapat dibaca.");
  }

  try {
    if (bitmap.width * bitmap.height > 20_000_000) {
      throw new Error("Resolusi gambar terlalu besar.");
    }

    const scale = Math.min(
      1,
      512 / Math.max(bitmap.width, bitmap.height),
    );

    const width = Math.max(
      1,
      Math.round(bitmap.width * scale),
    );

    const height = Math.max(
      1,
      Math.round(bitmap.height * scale),
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Gagal memproses gambar.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    let blob = null;

    for (const quality of [0.82, 0.72, 0.62]) {
      blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });

      if (blob && blob.size <= MAX_IMAGE_BLOB_SIZE) {
        break;
      }
    }

    if (!blob || blob.size > MAX_IMAGE_BLOB_SIZE) {
      throw new Error(
        "Foto terlalu besar setelah dikompres. Pilih gambar lain.",
      );
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Gagal membaca hasil gambar."));
        }
      };

      reader.onerror = () => {
        reject(new Error("Gagal membaca file gambar."));
      };

      reader.readAsDataURL(blob);
    });

    if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      throw new Error("Ukuran gambar hasil kompresi terlalu besar.");
    }

    return dataUrl;
  } finally {
    bitmap.close?.();
  }
}

export default function SellerProfilePage() {
  const { profile, accounts, user } = useSeller();

  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [contactError, setContactError] = useState("");
  const [contactSaved, setContactSaved] = useState(false);

  const [profileImage, setProfileImage] = useState(
    profile?.image || "",
  );

  const [imageError, setImageError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);

  if (!profile) {
    return <SellerFrame title="Profil seller." />;
  }

  async function selectProfileImage(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = "";

    if (!file) return;

    setImageError("");
    setError("");
    setSaved(false);
    setImageBusy(true);

    try {
      const image = await compressSellerImage(file);
      setProfileImage(image);
    } catch (failure) {
      setImageError(failure.message);
    } finally {
      setImageBusy(false);
    }
  }

  function removeProfileImage() {
    setProfileImage("");
    setImageError("");
    setError("");
    setSaved(false);
  }

  function submit(event) {
    event.preventDefault();

    setError("");
    setSaved(false);

    if (imageBusy) {
      setError("Tunggu sampai foto selesai diproses.");
      return;
    }

    try {
      const form = new FormData(event.currentTarget);

      accounts.updateSellerProfile({
        ...Object.fromEntries(form),
        image: profileImage,
        publicLocation: publicLocationFromForm(form),
      });

      setSaved(true);
    } catch (failure) {
      setError(failure.message);
    }
  }

  function saveContact(event) {
    event.preventDefault();

    setContactError("");
    setContactSaved(false);

    try {
      const values = Object.fromEntries(
        new FormData(event.currentTarget),
      );

      accounts.updateProfile(
        { phone: values.phone },
        { expectedUserId: user.id },
      );

      setContactSaved(true);
    } catch (failure) {
      setContactError(failure.message);
    }
  }

  return (
    <SellerFrame
      title="Profil seller."
      description="Ini profil publik yang dilihat pelanggan di marketplace. Pesanan lama tetap menyimpan nama kreator saat booking dibuat."
    >
      <PhotoEditor key={user.id} ownerUserId={user.id} scope="seller" mediaId={profile.imageMediaId}
        url={profile.image} currentOwner={() => accounts.current()?.id}
        onCommit={(imageMediaId) => {
          const current = accounts.getOwnedSeller(profile.id);
          accounts.updateSellerProfile({ ...current, specialties: current.specialties.join(", "), image: "", imageMediaId });
        }} />
      <form
        key={profile.id}
        className="ws-panel ws-form"
        onSubmit={submit}
        noValidate
      >
        <Input
          label="Nama kreator / studio"
          name="name"
          defaultValue={profile.name}
          maxLength={80}
          required
        />

        <div className="field-pair">
          <div className="field">
            <label htmlFor="profile-category">Kategori</label>
            <select
              id="profile-category"
              name="category"
              className="field__control"
              defaultValue={profile.category}
            >
              {sellerCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          <Input
            label="Kota"
            name="city"
            defaultValue={profile.city}
            maxLength={80}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="profile-bio">Bio</label>
          <textarea
            id="profile-bio"
            name="bio"
            className="field__control"
            defaultValue={profile.bio}
            maxLength={500}
            required
          />
          <span className="field__hint">
            30–500 karakter.
          </span>
        </div>

        <Input
          label="Spesialisasi"
          name="specialties"
          defaultValue={profile.specialties.join(", ")}
          hint="Pisahkan dengan koma."
        />

        <div className="field seller-profile-image-upload">
          <label htmlFor="seller-profile-image">
            Foto profil Seller (opsional)
          </label>

          <input
            id="seller-profile-image"
            className="field__control"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selectProfileImage}
            disabled={imageBusy}
            aria-describedby="seller-image-hint"
          />

          <span
            id="seller-image-hint"
            className="field__hint"
          >
            JPG, PNG, atau WEBP. Maksimal 5 MB.
            Gambar dikompres sebelum disimpan dan ditampilkan
            pada profil publik Seller.
          </span>

          {imageBusy && (
            <p className="seller-image-status" role="status">
              Sedang memproses foto...
            </p>
          )}

          {imageError && (
            <p className="ws-alert" role="alert">
              {imageError}
            </p>
          )}

          {profileImage && (
            <div className="seller-profile-image-preview">
              <img
                src={profileImage}
                alt="Pratinjau foto profil Seller"
              />

              <div>
                <strong>Pratinjau foto profil</strong>
                <span>
                  Foto ini akan terlihat di profil publik Seller.
                </span>

                <button
                  type="button"
                  className="button button--secondary"
                  onClick={removeProfileImage}
                  disabled={imageBusy}
                >
                  Hapus foto
                </button>
              </div>
            </div>
          )}
        </div>

        <Input
          label="Tautan portofolio (opsional)"
          name="portfolioLink"
          type="url"
          defaultValue={profile.portfolioLink}
        />

        <PublicLocationFields
          initial={profile.publicLocation}
        />

        {saved && (
          <p className="ws-success" role="status">
            Profil tersimpan.{" "}
            <Link
              className="ws-link"
              to={`/seller/${profile.id}`}
            >
              Lihat profil publik →
            </Link>
          </p>
        )}

        {error && (
          <p className="ws-alert" role="alert">
            {error}
          </p>
        )}

        <div className="ws-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={imageBusy}
          >
            Simpan profil
          </button>
        </div>
      </form>

      <section
        className="ws-section"
        aria-labelledby="seller-contact-heading"
      >
        <header>
          <h2 id="seller-contact-heading">Kontak akun.</h2>
        </header>

        <form
          className="ws-panel ws-form"
          onSubmit={saveContact}
          noValidate
        >
          <Input
            label="Email akun"
            value={user.email}
            disabled
            readOnly
            hint="Email adalah identitas akun dan belum dapat diubah."
          />

          <Input
            label="Nomor telepon (opsional)"
            name="phone"
            type="tel"
            defaultValue={user.phone}
            maxLength={25}
            autoComplete="tel"
            hint="Nomor ini disimpan pada profil akun bersama dan mengikuti validasi yang sudah digunakan Customer Profile."
          />

          {contactSaved && (
            <p className="ws-success" role="status">
              Kontak akun berhasil disimpan.
            </p>
          )}

          {contactError && (
            <p className="ws-alert" role="alert">
              {contactError}
            </p>
          )}

          <div className="ws-actions">
            <button
              className="button button--primary"
              type="submit"
            >
              Simpan kontak
            </button>
          </div>
        </form>
      </section>
    </SellerFrame>
  );
}

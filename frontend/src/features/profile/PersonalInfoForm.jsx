import { useRef, useState } from "react";
import Input from "../../components/ui/Input";
import { useAuth } from "../account/authContext";
import { validateProfilePatch } from "../account/profileValidation";
import Avatar from "./Avatar";

const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
const MAX_AVATAR_BLOB_SIZE = 180 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 250_000;

async function compressAvatar(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Gunakan gambar JPG, PNG, atau WEBP.");
  }

  if (file.size > MAX_AVATAR_FILE_SIZE) {
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

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

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

      if (blob && blob.size <= MAX_AVATAR_BLOB_SIZE) break;
    }

    if (!blob || blob.size > MAX_AVATAR_BLOB_SIZE) {
      throw new Error(
        "Foto masih terlalu besar setelah dikompres. Pilih gambar lain.",
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

      reader.onerror = () => reject(
        new Error("Gagal membaca file gambar."),
      );

      reader.readAsDataURL(blob);
    });

    if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new Error("Ukuran foto hasil kompresi masih terlalu besar.");
    }

    return dataUrl;
  } finally {
    bitmap.close?.();
  }
}

const fieldsFor = (user) => ({
  name: user.name,
  avatarUrl: user.avatarUrl,
  phone: user.phone,
  birthDate: user.birthDate,
  gender: user.gender,
});
export default function PersonalInfoForm({ user }) {
  const { store } = useAuth();
  const [values, setValues] = useState(() => fieldsFor(user));
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const dialog = useRef(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  function edit(event) {
    setValues((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
    setError("");
    setSuccess("");
  }

  async function selectAvatar(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];

  input.value = "";

  if (!file) return;

  setError("");
  setSuccess("");
  setIsProcessingAvatar(true);

  try {
    const avatarUrl = await compressAvatar(file);

    setValues((previous) => ({
      ...previous,
      avatarUrl,
    }));
  } catch (failure) {
    setError(failure.message);
  } finally {
    setIsProcessingAvatar(false);
  }
}

function removeAvatar() {
  setValues((previous) => ({
    ...previous,
    avatarUrl: "",
  }));

  setError("");
  setSuccess("");
}
  function review(event) {
    event.preventDefault();
    setSuccess("");
    setError("");
    try {
      setDraft(validateProfilePatch(values));
      dialog.current.showModal();
    } catch (failure) {
      setError(failure.message);
    }
  }
  function save() {
    try {
      const updated = store.updateProfile(draft, { expectedUserId: user.id });
      setValues(fieldsFor(updated));
      setSuccess("Data diri berhasil disimpan!");
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
    dialog.current.close();
    setDraft(null);
  }
  return (
    <section className="personal-card">
      <div className="personal-card-heading">
        <Avatar user={{ ...user, avatarUrl: values.avatarUrl }} />
        <div>
          <span className="market-kicker">PROFIL AKUN</span>
          <h2>Data diri</h2>
          <p>Informasi untuk kebutuhan akun dan komunikasi pesanan.</p>
        </div>
      </div>
      <form onSubmit={review}>
        <div className="personal-fields">
          <Input
            label="Nama lengkap"
            name="name"
            value={values.name}
            onChange={edit}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
          <Input
            label="Email"
            value={user.email}
            readOnly
            disabled
            hint="Email akun belum dapat diubah dari halaman ini."
          />
          <Input
            label="Nomor telepon (opsional)"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={edit}
            maxLength={25}
            autoComplete="tel"
          />
          <Input
            label="Tanggal lahir (opsional)"
            name="birthDate"
            type="date"
            value={values.birthDate}
            onChange={edit}
            autoComplete="bday"
          />
          <div className="field personal-gender-field">
  <label htmlFor="profile-gender">
    Jenis kelamin (opsional)
  </label>

  <select
    id="profile-gender"
    className="field__control"
    name="gender"
    value={values.gender}
    onChange={edit}
  >
    <option value="">Pilih jenis kelamin</option>
    <option>Perempuan</option>
    <option>Laki-laki</option>
    <option>Tidak ingin menyebutkan</option>
  </select>
</div>
          <div className="field personal-avatar-upload">
  <label htmlFor="profile-avatar-file">
    Upload foto profil (opsional)
  </label>

  <input
    id="profile-avatar-file"
    className="field__control"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    onChange={selectAvatar}
    disabled={isProcessingAvatar}
    aria-describedby="profile-avatar-hint"
  />

  <span
    id="profile-avatar-hint"
    className="field__hint"
  >
    JPG, PNG, atau WEBP. Maksimal 5 MB. Foto akan dikompres
    sebelum disimpan.
  </span>

  {isProcessingAvatar && (
    <span className="personal-field-note" role="status">
      Sedang memproses foto...
    </span>
  )}

  {values.avatarUrl && (
    <button
      type="button"
      className="button button--secondary"
      onClick={removeAvatar}
      disabled={isProcessingAvatar}
    >
      Hapus foto
    </button>
  )}
</div>
        </div>
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
          <p>Pastikan data diri kamu sudah benar.</p>
         <button
          type="submit"
          className="button button--primary"
          disabled={isProcessingAvatar}
        >
          Simpan Data Diri
        </button>
        </div>
      </form>
      <dialog
        className="personal-dialog"
        ref={dialog}
        aria-labelledby="profile-confirm-title"
        onCancel={() => setDraft(null)}
      >
        <h3 id="profile-confirm-title">Konfirmasi perubahan data</h3>
        <p>Periksa kembali informasi akun sebelum menyimpan perubahan.</p>
        <strong>{draft?.name}</strong>
        <div>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              dialog.current.close();
              setDraft(null);
            }}
          >
            Periksa Kembali
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={save}
          >
            Ya, Simpan
          </button>
        </div>
      </dialog>
    </section>
  );
}
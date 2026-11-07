import { useRef, useState } from "react";
import Input from "../../components/ui/Input";
import { useAuth } from "../account/authContext";
import { validateProfilePatch } from "../account/profileValidation";
import Avatar from "./Avatar";

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
  function edit(event) {
    setValues((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
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
        <Avatar user={user} />
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
          <label className="field">
            Jenis kelamin (opsional)
            <select
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
          </label>
          <Input
            label="URL foto profil (opsional)"
            name="avatarUrl"
            type="url"
            value={values.avatarUrl}
            onChange={edit}
            maxLength={2048}
            hint="URL http/https. Kosongkan untuk memakai inisial. Foto dimuat setelah disimpan."
          />
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
          <button type="submit" className="button button--primary">
            Simpan Data Diri ↗
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

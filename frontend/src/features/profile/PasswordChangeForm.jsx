import { useRef, useState } from "react";
import { useAuth } from "../account/authContext";
import PasswordInput from "../account/PasswordInput";

export default function PasswordChangeForm({ user }) {
  const { store } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const locked = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await store.changePassword(values, { expectedUserId: user.id });
      form.reset();
      setSuccess(
        "Kata sandi demo berhasil diubah. Gunakan kata sandi baru saat masuk berikutnya.",
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <section className="personal-card">
      <div className="personal-card-heading">
        <div className="personal-avatar" aria-hidden="true">
          ↻
        </div>
        <div>
          <span className="market-kicker">AKSES AKUN DEMO</span>
          <h2>Ubah kata sandi</h2>
          <p>Verifikasi kata sandi saat ini sebelum menyimpan yang baru.</p>
        </div>
      </div>
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset
          className="personal-fields personal-password-fields"
          disabled={busy}
        >
          <PasswordInput
            label="Kata sandi saat ini"
            name="currentPassword"
            required
            maxLength={128}
            autoComplete="current-password"
          />
          <PasswordInput
            label="Kata sandi baru"
            name="newPassword"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Konfirmasi kata sandi baru"
            name="confirmation"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          <p className="personal-field-note">
            Gunakan 8–128 karakter dan kata sandi khusus demo yang berbeda dari
            kata sandi saat ini.
          </p>
          <button type="submit" className="button button--primary">
            {busy ? "Memverifikasi…" : "Ubah Kata Sandi"} ↗
          </button>
        </fieldset>
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
      </form>
    </section>
  );
}

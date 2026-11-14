import { useRef, useState } from "react";
import Input from "../../components/ui/Input";
import { useAuth } from "../account/authContext";
import Avatar from "./Avatar";

const fieldsFor = (user) => ({
  name: user.name,
  avatarUrl: user.avatarUrl,
  phone: user.phone,
  birthDate: user.birthDate,
  gender: user.gender,
});
export default function PersonalInfoForm({ user }) {
  const { updateAccountProfile } = useAuth();
  const [values, setValues] = useState(() => fieldsFor(user));
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
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
    setDraft(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])));
    dialog.current.showModal();
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updateAccountProfile(draft, { expectedUserId: user.id });
      setValues(fieldsFor(updated));
      setSuccess("Profile saved.");
      setError("");
      dialog.current.close();
      setDraft(null);
    } catch (failure) {
      const details = Array.isArray(failure.details) ? failure.details.map((item) => item.message).filter(Boolean) : [];
      setError([failure.message, ...details].join(" "));
      if (dialog.current?.open) dialog.current.close();
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="personal-card">
      <div className="personal-card-heading">
        <Avatar user={user} />
        <div>
          <span className="market-kicker">PROFIL AKUN</span>
          <h2>Personal information</h2>
          <p>Account and order contact information.</p>
        </div>
      </div>
      <form onSubmit={review} aria-busy={busy}>
        <fieldset className="personal-fields" disabled={busy}>
          <Input
            label="Full name"
            name="name"
            value={values.name}
            onChange={edit}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
          <Input
            label="Email address"
            value={user.email}
            readOnly
            disabled
            hint="Account email address belum dapat diubah of halaman ini."
          />
          <Input
            label="Avatar image URL (optional)"
            name="avatarUrl"
            type="url"
            value={values.avatarUrl}
            onChange={edit}
            maxLength={2048}
            autoComplete="url"
          />
          <Input
            label="Phone number (optional)"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={edit}
            maxLength={25}
            autoComplete="tel"
          />
          <Input
            label="Date of birth (optional)"
            name="birthDate"
            type="date"
            value={values.birthDate}
            onChange={edit}
            autoComplete="bday"
          />
          <label className="field">
            Gender (optional)
            <select
              className="field__control"
              name="gender"
              value={values.gender}
              onChange={edit}
            >
              <option value="">Select a gender</option>
              <option value="Perempuan">Female</option>
              <option value="Laki-laki">Male</option>
              <option value="Tidak ingin menyebutkan">Prefer not to say</option>
            </select>
          </label>
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
        <div className="personal-form-actions">
          <p>Make sure your profile details are correct.</p>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
      <dialog
        className="personal-dialog"
        ref={dialog}
        aria-labelledby="profile-confirm-title"
        onCancel={() => setDraft(null)}
      >
        <h3 id="profile-confirm-title">Confirm profile changes</h3>
        <p>Review your account information before saving changes.</p>
        <strong>{draft?.name}</strong>
        <div>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => {
              dialog.current.close();
              setDraft(null);
            }}
          >
            Review again
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={save}
          >
            {busy ? "Saving…" : "Confirm save"}
          </button>
        </div>
      </dialog>
    </section>
  );
}

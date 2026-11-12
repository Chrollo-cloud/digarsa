import PhotoEditor from "../media/PhotoEditor";
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
      const updated = store.updateProfile({ ...draft, ...(draft.avatarUrl ? { avatarMediaId: "" } : {}) }, { expectedUserId: user.id });
      setValues(fieldsFor(updated));
      setSuccess("Profile saved.");
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
          <h2>Personal information</h2>
          <p>Account and order contact information.</p>
        </div>
      </div>
      <PhotoEditor key={user.id} ownerUserId={user.id} scope="account"
        mediaId={user.avatarMediaId} url={user.avatarUrl} currentOwner={() => store.current()?.id}
        onCommit={(avatarMediaId) => {
          store.updateProfile({ avatarMediaId, avatarUrl: "" }, { expectedUserId: user.id });
          setValues(previous => ({ ...previous, avatarUrl: "" }));
        }} />
      <form onSubmit={review}>
        <div className="personal-fields">
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
              <option>Female</option>
              <option>Male</option>
              <option>Prefer not to say</option>
            </select>
          </label>
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
          <p>Make sure your profile details are correct.</p>
          <button type="submit" className="button button--primary">
            Save Data Diri
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
            onClick={save}
          >
            Ya, Save
          </button>
        </div>
      </dialog>
    </section>
  );
}

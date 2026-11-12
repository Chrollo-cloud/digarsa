import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { useAuth } from "./authContext";
import { sellerCategories } from "./demoStore";
import DemoNotice from "./DemoNotice";
import "./account.css";

export default function OnboardingPage() {
  const { user, store } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState("");
  useEffect(() => {
    document.title = "Become a creator — Digarsa";
  }, []);
  if (user.sellerProfileId) return <Navigate to="/seller-dashboard" replace />;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      store.activateSeller(
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      navigate("/seller-dashboard", { replace: true });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  return (
    <div className="account-onboarding">
      <section className="account-onboarding__intro">
        <Link to="/marketplace">← Back to marketplace</Link>
        <span className="account-kicker">DIGARSA / SELLER PROFILE</span>
        <h1>
          Jadikan karyamu
          <br />
          <span>mudah ditemukan.</span>
        </h1>
        <p>
          Kenalkan studio atau keahlianmu, tampilkan services, lalu kelola
          kolaborasi of akun Digarsa yang sama.
        </p>
        <p className="account-benefit">
          One account to find services and work as a creator.
        </p>
      </section>
      <section className="account-onboarding__panel">
        <span className="account-kicker">MULAI SEBAGAI KREATOR · 01 / 01</span>
        <h2>Profil kreatormu.</h2>
        <p>
          Aktifkan Seller Profile, lalu kelola services, orders, dan percakapan
          di Seller Center.
        </p>
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            <Input
              label="Creator or studio name"
              name="name"
              required
              minLength={2}
              maxLength={80}
            />
            <div className="account-field-pair">
              <label className="field">
                Kategori utama
                <select
                  className="field__control"
                  name="category"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {sellerCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <Input
                label="City atau wilayah"
                name="city"
                required
                minLength={2}
                maxLength={80}
                autoComplete="address-level2"
              />
            </div>
            <label className="field">
              Bio singkat
              <textarea
                className="field__control"
                name="bio"
                required
                minLength={30}
                maxLength={500}
                rows={4}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                aria-describedby="bio-count"
              />
            </label>
            <small id="bio-count">{bio.length}/500 karakter</small>
            <div className="account-field-pair">
              <Input
                label="URL foto profil (opsional)"
                name="image"
                type="url"
                maxLength={2048}
              />
              <Input
                label="Portfolio / sosial media (opsional)"
                name="portfolioLink"
                type="url"
                maxLength={2048}
              />
            </div>
            <Input
              label="Spesialisasi (opsional)"
              name="specialties"
              maxLength={500}
              hint="Separate with commas."
            />
            {error && (
              <p className="account-feedback is-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit">
              {busy ? "Activating…" : "Activate Creator Account"}
            </Button>
          </fieldset>
        </form>
        <DemoNotice />
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { useAuth } from "./authContext";
import { applySellerProfile, getMySellerProfile } from "../sellerPreparation/sellerPreparationApi.js";
import SellerPreparationPanel from "../sellerPreparation/SellerPreparationPanel.jsx";
import PublicLocationFields from "../location/PublicLocationFields.jsx";
import { publicLocationFromForm } from "../location/locationModel.js";
import { sellerCategories } from "./demoStore";
import "./account.css";

const errorText = (error) => [error?.message || "The request could not be completed.", ...(Array.isArray(error?.details) ? error.details.map((item) => item.message).filter(Boolean) : [])].join(" ");

export default function OnboardingPage() {
  const { user, refreshAccount, logout } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bio, setBio] = useState("");
  const [profileLoading, setProfileLoading] = useState(Boolean(user.sellerProfileId));
  const [profileError, setProfileError] = useState("");
  useEffect(() => { document.title = "Become a creator — Digarsa"; }, []);
  useEffect(() => {
    if (!user.sellerProfileId) return undefined;
    const controller = new AbortController();
    getMySellerProfile({ signal: controller.signal }).then(setProfile).catch((failure) => {
      if (failure?.name !== "AbortError") {
        if (failure?.status === 401) logout();
        setProfileError(errorText(failure));
      }
    }).finally(() => { if (!controller.signal.aborted) setProfileLoading(false); });
    return () => controller.abort();
  }, [logout, user.sellerProfileId]);
  if (user.capabilities?.includes("seller")) return <Navigate to="/seller-dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    form.specialties = form.specialties ? form.specialties.split(",").map((item) => item.trim()).filter(Boolean) : [];
    form.publicLocation = publicLocationFromForm(new FormData(event.currentTarget));
    try {
      const saved = await applySellerProfile(form);
      setProfile(saved);
      await refreshAccount();
    } catch (failure) { if (failure?.status === 401) logout(); setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return (
    <div className="account-onboarding">
      <section className="account-onboarding__intro">
        <Link to="/marketplace">← Back to marketplace</Link>
        <span className="account-kicker">DIGARSA / SELLER PROFILE</span>
        <h1>Jadikan karyamu<br /><span>mudah ditemukan.</span></h1>
        <p>Siapkan profil, portofolio, dan service offer sebelum mengajukan aktivasi untuk ditinjau manual.</p>
        <p className="account-benefit">One account to find services and work as a creator.</p>
      </section>
      <section className="account-onboarding__panel">
        {profileLoading ? <p role="status">Loading your seller profile…</p> : profileError ? <p className="account-feedback is-error" role="alert">Your seller profile could not be loaded. {profileError}</p> : profile ? <>
          <span className="account-kicker">SELLER PREPARATION</span>
          <h2>Seller profile saved.</h2>
          <p>Aktivasi hanya dapat diputuskan melalui review backend. Lengkapi persiapan dan periksa status di bawah.</p>
          <SellerPreparationPanel initialProfile={profile} />
        </> : <>
          <span className="account-kicker">MULAI SEBAGAI KREATOR</span>
          <h2>Profil kreatormu.</h2>
          <p>Informasi ini disimpan pada seller profile Digarsa. Tidak diperlukan dokumen identitas pemerintah.</p>
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy}>
              <Input label="Creator or studio name" name="name" required minLength={2} maxLength={80} />
              <div className="account-field-pair">
                <label className="field">Kategori utama<select className="field__control" name="category" required defaultValue=""><option value="" disabled>Select a category</option>{sellerCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <Input label="City atau wilayah" name="city" required minLength={2} maxLength={80} autoComplete="address-level2" />
              </div>
              <label className="field">Bio singkat<textarea className="field__control" name="bio" required minLength={30} maxLength={500} rows={4} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
              <small>{bio.length}/500 karakter</small>
              <div className="account-field-pair">
                <Input label="URL foto profil (opsional)" name="image" type="url" maxLength={2048} />
                <Input label="Portfolio / sosial media (opsional)" name="portfolioLink" type="url" maxLength={2048} />
              </div>
              <Input label="Spesialisasi (opsional)" name="specialties" maxLength={500} hint="Pisahkan dengan koma." />
              <PublicLocationFields />
              {error && <p className="account-feedback is-error" role="alert">{error}</p>}
              <Button type="submit">{busy ? "Saving…" : "Save seller profile"}</Button>
            </fieldset>
          </form>
        </>}
      </section>
    </div>
  );
}

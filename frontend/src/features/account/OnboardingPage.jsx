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
  const [profileImage, setProfileImage] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    document.title = "Jadi Kreator — Digarsa";
  }, []);
  if (user.sellerProfileId) return <Navigate to="/seller-dashboard" replace />;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      values.image = profileImage;
      store.activateSeller(values);
      navigate("/seller-dashboard", { replace: true });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  return (
    <div className="account-onboarding">
      <section className="account-onboarding__intro">
        <Link to="/marketplace">← Kembali ke marketplace</Link>
        <span className="account-kicker">DIGARSA / SELLER PROFILE</span>
        <h1>
          Jadikan karyamu
          <br />
          <span>mudah ditemukan.</span>
        </h1>
        <p>
          Kenalkan studio atau keahlianmu, tampilkan layanan, lalu kelola
          kolaborasi dari akun Digarsa yang sama.
        </p>
        <p className="account-benefit">
          Satu akun untuk mencari layanan dan berkarya sebagai kreator.
        </p>
      </section>
      <section className="account-onboarding__panel">
        <span className="account-kicker">MULAI SEBAGAI KREATOR · 01 / 01</span>
        <h2>Profil kreatormu.</h2>
        <p>
          Aktifkan Seller Profile, lalu kelola layanan, pesanan, dan percakapan
          di Seller Center.
        </p>
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            <Input
              label="Nama kreator atau studio"
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
                    Pilih kategori
                  </option>
                  {sellerCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <Input
                label="Kota atau wilayah"
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
              <div className="field account-avatar-upload">
                <label htmlFor="creator-avatar-file">Foto profil (opsional)</label>
                <input id="creator-avatar-file" className="field__control" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
                  const input = event.currentTarget; const file = input.files?.[0]; input.value = ""; setImageError("");
                  if (!file) return;
                  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setImageError("Gunakan gambar JPG, PNG, atau WEBP."); return; }
                  if (file.size > 5 * 1024 * 1024) { setImageError("Ukuran gambar maksimal 5 MB."); return; }
                  try {
                    const bitmap = await createImageBitmap(file);
                    if (bitmap.width * bitmap.height > 20000000) throw new Error("Resolusi gambar terlalu besar.");
                    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
                    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                    const context = canvas.getContext("2d"); if (!context) throw new Error("Gagal memproses gambar.");
                    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
                    let blob = null; for (const quality of [0.82, 0.72, 0.62]) { blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)); if (blob && blob.size <= 180 * 1024) break; }
                    if (!blob || blob.size > 180 * 1024) throw new Error("Foto terlalu besar setelah dikompres.");
                    const reader = new FileReader(); reader.onload = () => setProfileImage(String(reader.result)); reader.onerror = () => setImageError("Gagal membaca foto."); reader.readAsDataURL(blob);
                  } catch (failure) { setImageError(failure.message || "Foto tidak dapat diproses."); }
                }} />
                <small>Pilih foto dari perangkat (JPG, PNG, WEBP; maksimal 5 MB).</small>
                {imageError && <small className="account-feedback is-error" role="alert">{imageError}</small>}
                {profileImage && <button type="button" className="button button--secondary" onClick={() => setProfileImage("")}>Hapus foto</button>}
              </div>
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
              hint="Pisahkan dengan koma."
            />
            {error && (
              <p className="account-feedback is-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit">
              {busy ? "Mengaktifkan…" : "Aktifkan Akun Kreator"} ↗
            </Button>
          </fieldset>
        </form>
        <DemoNotice />
      </section>
    </div>
  );
}
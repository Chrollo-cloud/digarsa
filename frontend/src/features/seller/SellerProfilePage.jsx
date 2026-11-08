import { useState } from "react";
import { Link } from "react-router-dom";
import Input from "../../components/ui/Input";
import { sellerCategories } from "../account/demoStore";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

export default function SellerProfilePage() {
  const { profile, accounts, user } = useSeller();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  if (!profile) return <SellerFrame title="Profil seller." />;
  function submit(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    try {
      accounts.updateSellerProfile(
        Object.fromEntries(new FormData(event.currentTarget)),
      );
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
      const values = Object.fromEntries(new FormData(event.currentTarget));
      accounts.updateProfile({ phone: values.phone }, { expectedUserId: user.id });
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
      <form className="ws-panel ws-form" onSubmit={submit} noValidate>
        <Input label="Nama kreator / studio" name="name" defaultValue={profile.name} maxLength={80} required />
        <div className="field-pair">
          <div className="field">
            <label htmlFor="profile-category">Kategori</label>
            <select id="profile-category" name="category" className="field__control" defaultValue={profile.category}>
              {sellerCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <Input label="Kota" name="city" defaultValue={profile.city} maxLength={80} required />
        </div>
        <div className="field">
          <label htmlFor="profile-bio">Bio</label>
          <textarea id="profile-bio" name="bio" className="field__control" defaultValue={profile.bio} maxLength={500} required />
          <span className="field__hint">30–500 karakter.</span>
        </div>
        <Input label="Spesialisasi" name="specialties" defaultValue={profile.specialties.join(", ")} hint="Pisahkan dengan koma." />
        <Input label="Foto profil (URL, opsional)" name="image" type="url" defaultValue={profile.image} />
        <Input label="Tautan portofolio (opsional)" name="portfolioLink" type="url" defaultValue={profile.portfolioLink} />
        {saved && (
          <p className="ws-success" role="status">
            Profil tersimpan.{" "}
            <Link className="ws-link" to={`/seller/${profile.id}`}>
              Lihat profil publik ↗
            </Link>
          </p>
        )}
        {error && (
          <p className="ws-alert" role="alert">
            {error}
          </p>
        )}
        <div className="ws-actions">
          <button className="button button--primary" type="submit">
            Simpan profil
          </button>
        </div>
      </form>
      <section className="ws-section" aria-labelledby="seller-contact-heading">
        <header>
          <h2 id="seller-contact-heading">Kontak akun.</h2>
        </header>
        <form className="ws-panel ws-form" onSubmit={saveContact} noValidate>
          <Input label="Email akun" value={user.email} disabled readOnly hint="Email adalah identitas akun dan belum dapat diubah." />
          <Input
            label="Nomor telepon (opsional)"
            name="phone"
            type="tel"
            defaultValue={user.phone}
            maxLength={25}
            autoComplete="tel"
            hint="Nomor ini disimpan pada profil akun bersama dan mengikuti validasi yang sudah digunakan Customer Profile."
          />
          {contactSaved && <p className="ws-success" role="status">Kontak akun berhasil disimpan.</p>}
          {contactError && <p className="ws-alert" role="alert">{contactError}</p>}
          <div className="ws-actions">
            <button className="button button--primary" type="submit">Simpan kontak</button>
          </div>
        </form>
      </section>
    </SellerFrame>
  );
}

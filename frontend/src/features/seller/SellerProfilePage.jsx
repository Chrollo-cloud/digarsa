import { useState } from "react";
import Input from "../../components/ui/Input";
import SellerFrame from "./SellerFrame";
import SellerPreparationPanel from "../sellerPreparation/SellerPreparationPanel.jsx";
import { useAuth } from "../account/authContext";

export default function SellerProfilePage() {
  const { user, updateAccountProfile } = useAuth();
  const [contactError, setContactError] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);

  async function saveContact(event) {
    event.preventDefault();
    if (contactBusy) return;
    setContactBusy(true); setContactError(""); setContactSaved(false);
    try {
      await updateAccountProfile({ phone: new FormData(event.currentTarget).get("phone") }, { expectedUserId: user.id });
      setContactSaved(true);
    } catch (failure) {
      setContactError([failure.message, ...(Array.isArray(failure.details) ? failure.details.map((item) => item.message).filter(Boolean) : [])].join(" "));
    } finally { setContactBusy(false); }
  }

  return (
    <SellerFrame serverBacked title="Profil seller." description="Informasi seller, aktivasi, portofolio, dan service offer tersimpan melalui API Digarsa.">
      <SellerPreparationPanel />
      <section className="ws-section" aria-labelledby="seller-contact-heading">
        <header><h2 id="seller-contact-heading">Kontak akun.</h2></header>
        <form className="ws-panel ws-form" onSubmit={saveContact} aria-busy={contactBusy}>
          <Input label="Email akun" value={user.email} disabled readOnly hint="Email adalah identitas akun dan belum dapat diubah." />
          <Input label="Nomor telepon (opsional)" name="phone" type="tel" defaultValue={user.phone || ""} maxLength={25} autoComplete="tel" hint="Kontak ini disimpan pada profil akun bersama." />
          {contactSaved && <p className="ws-success" role="status">Kontak akun berhasil disimpan.</p>}
          {contactError && <p className="ws-alert" role="alert">{contactError}</p>}
          <div className="ws-actions"><button className="button button--primary" type="submit" disabled={contactBusy}>{contactBusy ? "Saving…" : "Simpan kontak"}</button></div>
        </form>
      </section>
      <p className="seller-prep-footnote">Seller profile preparation and activation are server-backed. Other Seller Center tools may still use local demonstration data.</p>
    </SellerFrame>
  );
}

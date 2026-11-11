import { useState } from "react";
import { useAuth } from "./authContext";
import "./report-account.css";

const reasons = [
  "Penipuan atau transaksi mencurigakan",
  "Pelecehan atau komunikasi tidak pantas",
  "Identitas atau profil palsu",
  "Spam atau penyalahgunaan platform",
  "Lainnya",
];

export default function ReportAccountButton({ targetAccountId, targetSellerProfileId, label = "Laporkan akun" }) {
  const { user, store } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!user) return null;
  function submit(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      store.reportAccount({ targetAccountId, targetSellerProfileId, reason, details });
      setMessage("Laporan terkirim dan menunggu peninjauan Admin.");
      setDetails(""); setOpen(false);
    } catch (failure) { setError(failure.message); }
  }
  return <div className="report-account">
    <button type="button" className="report-account__trigger" onClick={() => setOpen((value) => !value)}>{label}</button>
    {message && <p role="status" className="report-account__success">{message}</p>}
    {open && <form className="report-account__form" onSubmit={submit}>
      <strong>Laporkan akun ini</strong>
      <label>Alasan laporan<select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Detail kejadian<textarea value={details} onChange={(event) => setDetails(event.target.value)} minLength={10} maxLength={1000} required placeholder="Jelaskan kejadian secara singkat (minimal 10 karakter)." /></label>
      {error && <p role="alert" className="report-account__error">{error}</p>}
      <div><button type="button" onClick={() => setOpen(false)}>Batal</button><button type="submit">Kirim laporan</button></div>
      <small>Laporan akan ditinjau Admin. Laporan tidak otomatis menghapus akun.</small>
    </form>}
  </div>;
}
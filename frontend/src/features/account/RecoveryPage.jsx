import { Link } from "react-router-dom";
import "./account.css";

// Deliberately no public email lookup, recovery token or password mutation here.
export default function RecoveryPage() {
  return <div className="account-auth">
    <aside className="account-editorial">
      <span className="account-kicker">WHERE IDEAS MEET TALENT</span>
      <h1>Kembali<br />ke ide<br /><em>baikmu.</em></h1>
      <p>Pemulihan yang jujur, tanpa janji email yang belum tersedia.</p>
      <small>DIGARSA / INDONESIA</small>
    </aside>
    <section className="account-auth__form">
      <div>
        <span className="account-kicker">PEMULIHAN AKUN DEMO</span>
        <h2>Lupa kata sandi<span>?</span></h2>
        <p>Digarsa belum mengirim email atau tautan pemulihan. Halaman ini tidak memeriksa apakah sebuah email terdaftar dan tidak dapat mengganti kata sandi akun lain.</p>
        <p>Jika masih masuk, ubah kata sandi melalui Pengaturan dengan kata sandi saat ini. Untuk akun demo lokal yang terkunci, minta pengembang menjalankan utilitas pemulihan offline pada cadangan akun milikmu.</p>
        <p>Pengembang harus memiliki akses ke cadangan lokal dan memverifikasi ID akun secara langsung. Tidak ada sandi universal atau tombol reset publik.</p>
        <p>Pemulihan produksi memerlukan token atau OTP dari backend, dengan masa berlaku dan sekali pakai.</p>
        <Link className="button button--primary" to="/login">Kembali ke Masuk →</Link>
      </div>
    </section>
  </div>;
}

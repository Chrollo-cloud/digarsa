import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./authContext";
import PasswordInput from "./PasswordInput";
import Input from "../../components/ui/Input";
import "./account.css";

const stepTitles = ["Enter Email", "Verify Code", "Enter New Password", "Success"];
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function PasswordResetPage() {
  const { store } = useAuth();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState(["", "", "", ""]);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = useRef([]);

  useEffect(() => {
    document.title = "Reset password — Digarsa";
  }, []);
  useEffect(() => {
    if (!challenge) return undefined;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  function requestCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = store.requestPasswordReset(email);
      setChallenge(next);
      setSeconds(Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)));
      setCode(["", "", "", ""]);
      setStep(1);
    } catch (failure) {
      setError(failure.message || "Kode verifikasi belum dapat dikirim.");
    } finally {
      setBusy(false);
    }
  }
  function updateCode(index, value) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setCode((current) => current.map((item, position) => position === index ? digit : item));
    if (digit && index < 3) refs.current[index + 1]?.focus();
  }
  function pasteCode(event) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!digits) return;
    event.preventDefault();
    setCode(Array.from({ length: 4 }, (_, index) => digits[index] || ""));
    refs.current[Math.min(digits.length, 3)]?.focus();
  }
  function verify(event) {
    event.preventDefault();
    setError("");
    try {
      store.verifyPasswordResetCode(challenge.challengeId, email, code.join(""));
      setStep(2);
    } catch (failure) {
      setError(failure.message || "Kode belum dapat diverifikasi.");
    }
  }
  async function complete(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await store.completePasswordReset(
        challenge.challengeId,
        email,
        form.get("newPassword"),
        form.get("confirmation"),
      );
      setStep(3);
    } catch (failure) {
      setError(failure.message || "Password belum dapat diubah.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-auth password-reset-page">
      <aside className="account-editorial">
        <span className="account-kicker">WHERE IDEAS MEET TALENT</span>
        <h1>Jaga akun<br />dan <em>ide baikmu.</em></h1>
        <p>Atur ulang password akun Digarsa dengan alur verifikasi demo.</p>
        <small>DIGARSA / INDONESIA</small>
      </aside>
      <main className="password-reset-card">
        <Link className="password-reset-back" to="/login">← Kembali ke Login</Link>
        <span className="password-reset-icon" aria-hidden="true">{step === 0 ? "✉" : step === 1 ? "♥" : step === 2 ? "▣" : "✓"}</span>
        <div className="password-reset-progress" aria-label={`Tahap ${step + 1} dari 4`}>
          {stepTitles.map((title, index) => <span key={title} className={index <= step ? "is-current" : ""} />)}
        </div>
        <span className="account-kicker">TAHAP {step + 1} / 4</span>
        <h1>{stepTitles[step]}</h1>
        <p className="password-reset-subtitle">{[
          "Masukkan email akun untuk menerima kode verifikasi.",
          `Masukkan kode 4 digit yang dikirim ke ${email}.`,
          "Buat password baru yang aman untuk akunmu.",
          "Password berhasil diatur ulang.",
        ][step]}</p>
        {step === 0 && <form onSubmit={requestCode}>
          <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" />
          <button className="button button--primary" disabled={busy} type="submit">{busy ? "Mengirim…" : "Send Verify Code"}</button>
        </form>}
        {step === 1 && <form onSubmit={verify}>
          <div className="password-reset-otp" onPaste={pasteCode}>
            {code.map((digit, index) => <input key={index} ref={(node) => { refs.current[index] = node; }} aria-label={`Digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={1} value={digit} onChange={(event) => updateCode(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && !code[index] && index > 0) refs.current[index - 1]?.focus(); }} required />)}
          </div>
          <div className="password-reset-resend">{seconds ? <span>Kirim ulang dalam {formatTime(seconds)}</span> : <button type="button" onClick={requestCode}>Resend Code</button>}</div>
          {import.meta.env.DEV && <p className="password-reset-demo-code">Kode demo: <strong>{challenge?.code}</strong><br />Simulasi lokal untuk development; kode tidak dikirim melalui email.</p>}
          <button className="button button--primary" type="submit">Verify Code</button>
        </form>}
        {step === 2 && <form onSubmit={complete}>
          <PasswordInput name="newPassword" label="New password" required minLength={8} maxLength={128} autoComplete="new-password" />
          <PasswordInput name="confirmation" label="Confirm password" required minLength={8} maxLength={128} autoComplete="new-password" />
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Reset password"}</button>
        </form>}
        {step === 3 && <div className="password-reset-success"><strong aria-hidden="true">✓</strong><p>Password reset successfully.</p><Link className="button button--primary" to="/login">Continue to Log In</Link></div>}
        {error && <p className="account-feedback is-error" role="alert">{error}</p>}
        <p className="password-reset-disclaimer">Simulasi lokal development. OTP di layar ini bukan verifikasi email dan tidak aman untuk production.</p>
      </main>
    </div>
  );
}

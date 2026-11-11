import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import DemoNotice from "./DemoNotice";
import PasswordInput from "./PasswordInput";
import { useAuth } from "./authContext";
import { safeReturnTo } from "./redirects";
import "./account.css";

export default function AuthPage({ register = false }) {
  const { user, store, storageError } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const destination = safeReturnTo(params.get("returnTo"));
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = `${register ? "Buat akun" : "Masuk"} — Digarsa`;
  }, [register]);
  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(
      () => navigate(destination, { replace: true }),
      700,
    );
    return () => window.clearTimeout(timer);
  }, [success, destination, navigate]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (register) await store.register(Object.fromEntries(form));
      else await store.login(form.get("email"), form.get("password"));
      setSuccess(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-auth">
      <aside className="account-editorial">
        <span className="account-kicker">WHERE IDEAS MEET TALENT</span>
        <h1>
          {register ? (
            <>
              Punya ide?
              <br />
              <em>Temukan</em>
              <br />
              orangnya.
            </>
          ) : (
            <>
              Ide baik
              <br />
              dimulai dari
              <br />
              <em>pertemuan.</em>
            </>
          )}
        </h1>
        <p>Marketplace kreatif untuk kolaborasi yang terasa lebih dekat.</p>
        <small>DIGARSA / INDONESIA</small>
      </aside>
      <section className="account-auth__form">
        <div>
          <span className="account-kicker">
            {register ? "MULAI BERKOLABORASI" : "AKUN DIGARSA"}
          </span>
          <h2>
            {register ? "Buat akun" : "Selamat datang kembali"}
            <span>.</span>
          </h2>
          <p>
            {register
              ? "Satu akun untuk mencari layanan dan berkarya sebagai kreator."
              : "Masuk dan lanjutkan ide baikmu."}
          </p>
          {success || user ? (
            <div className="account-feedback" role="status">
              <p>
                {success
                  ? register
                    ? "Akun demo berhasil dibuat."
                    : "Berhasil masuk."
                  : `Kamu masuk sebagai ${user.name}.`}
              </p>
              <Button to={destination}>Lanjutkan →</Button>
            </div>
          ) : (
            <form onSubmit={submit} aria-busy={busy}>
              <fieldset disabled={busy}>
                {register && (
                  <Input
                    label="Nama lengkap"
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                  />
                )}
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                />
                <PasswordInput
                  name="password"
                  required
                  minLength={register ? 8 : 1}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "Minimal 8 karakter" : "Kata sandi demo"
                  }
                />
                {!register && (
                  <Link className="account-forgot-password" to="/reset-password">
                    Lupa password?
                  </Link>
                )}
                <Button type="submit">
                  {busy ? "Memeriksa…" : register ? "Buat akun" : "Masuk"}{" "}
                  <span aria-hidden="true">↗</span>
                </Button>
              </fieldset>
            </form>
          )}
          {(error || storageError) && (
            <p className="account-feedback is-error" role="alert">
              {error || storageError}
            </p>
          )}
          <DemoNotice />
          {!user && (
            <p className="account-switch">
              {register ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
              <Link
                to={`${register ? "/login" : "/register"}?returnTo=${encodeURIComponent(destination)}`}
              >
                {register ? "Masuk" : "Daftar sekarang"} ↗
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

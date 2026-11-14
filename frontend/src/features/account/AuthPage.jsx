import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import DemoNotice from "./DemoNotice";
import PasswordInput from "./PasswordInput";
import { useAuth } from "./authContext";
import { accountReturnTo } from "./redirects";
import "./account.css";

export default function AuthPage({ register = false }) {
  const { user, store, storageError, status } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [destination, setDestination] = useState(() => accountReturnTo(params.get("returnTo"), user));
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = `${register ? "Create an account" : "Log in"} — Digarsa`;
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
      const account = register
        ? await store.register(Object.fromEntries(form))
        : await store.login(form.get("email"), form.get("password"));
      setDestination(accountReturnTo(params.get("returnTo"), account));
      setSuccess(true);
    } catch (failure) {
      const details = Array.isArray(failure.details)
        ? failure.details.map((item) => [item.field, item.message].filter(Boolean).join(": ")).filter(Boolean)
        : [];
      setError([failure.message, ...details].join(" "));
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
              Have an idea?
              <br />
              <em>Find</em>
              <br />
              the right people.
            </>
          ) : (
            <>
              Good ideas
              <br />
              start with
              <br />
              <em>connection.</em>
            </>
          )}
        </h1>
        <p>A creative marketplace for meaningful collaboration.</p>
        <small>DIGARSA / INDONESIA</small>
      </aside>
      <section className="account-auth__form">
        <div>
          <span className="account-kicker">
            {register ? "START COLLABORATING" : "DIGARSA ACCOUNT"}
          </span>
          <h2>
            {register ? "Create an account" : "Welcome back"}
            <span>.</span>
          </h2>
          <p>
            {register
              ? "One account to find services and work as a creator."
              : "Log in and keep your ideas moving."}
          </p>
          {status === "loading" ? (
            <p className="account-feedback" role="status">Checking your Digarsa session…</p>
          ) : success || user ? (
            <div className="account-feedback" role="status">
              <p>
                {success
                  ? register
                    ? "Your Digarsa account has been created."
                    : "You are logged in."
                  : `Logged in as ${user.name}.`}
              </p>
              <Button to={destination}>Lanjutkan </Button>
            </div>
          ) : (
            <form onSubmit={submit} aria-busy={busy}>
              <fieldset disabled={busy}>
                {register && (
                  <Input
                    label="Full name"
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                  />
                )}
                <Input
                    label="Email address address"
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
                    register ? "At least 8 characters" : "Password"
                  }
                />
                <Button type="submit">
                  {busy ? "Checking…" : register ? "Create an account" : "Log in"}{" "}
                  <span aria-hidden="true"></span>
                </Button>
              </fieldset>
            </form>
          )}
          {(error || storageError) && (
            <p className="account-feedback is-error" role="alert">
              {error || storageError}
            </p>
          )}
          {!register && !user && <p className="account-switch"><Link to="/forgot-password">Forgot password?</Link></p>}
          <DemoNotice />
          {!user && (
            <p className="account-switch">
              {register ? "Already have an account?" : "New to Digarsa?"}{" "}
              <Link
                to={`${register ? "/login" : "/register"}?returnTo=${encodeURIComponent(destination)}`}
              >
                {register ? "Log in" : "Sign up"}
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

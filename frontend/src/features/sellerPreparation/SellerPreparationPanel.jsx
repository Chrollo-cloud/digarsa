import { useCallback, useEffect, useState } from "react";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { money } from "../../utils/money.js";
import { useAuth } from "../account/authContext";
import PublicLocationFields from "../location/PublicLocationFields.jsx";
import { publicLocationFromForm } from "../location/locationModel.js";
import {
  canSubmitActivation,
  canWithdrawActivation,
  createPortfolioItem,
  deletePortfolioItem,
  getMyActivationStatus,
  getMySellerProfile,
  listMyPortfolio,
  listMyServices,
  submitActivationReview,
  updateMySellerProfile,
  withdrawActivationReview,
} from "./sellerPreparationApi.js";
import "./seller-preparation.css";

const CATEGORIES = ["Branding", "Fotografi & Film", "Web & Digital", "Illustration & Motion"];
const STATUS_LABELS = {
  NOT_SUBMITTED: "Not submitted",
  PENDING: "In review",
  APPROVED: "Approved",
  REJECTED: "Changes requested",
  WITHDRAWN: "Withdrawn",
};
const errorText = (error) => {
  const details = Array.isArray(error?.details) ? error.details.map((item) => item.message).filter(Boolean) : [];
  return [error?.message || "The request could not be completed.", ...details].join(" ");
};
const editValues = (profile) => ({
  name: profile?.name || "",
  category: profile?.category || CATEGORIES[0],
  city: profile?.city || "",
  bio: profile?.bio || "",
  image: profile?.image || "",
  portfolioLink: profile?.portfolioLink || "",
  specialties: Array.isArray(profile?.specialties) ? profile.specialties.join(", ") : "",
});

export default function SellerPreparationPanel({ initialProfile, onProfileUpdated }) {
  const { refreshAccount, logout } = useAuth();
  const [profile, setProfile] = useState(initialProfile);
  const [values, setValues] = useState(() => editValues(initialProfile));
  const [activation, setActivation] = useState(null);
  const [activationError, setActivationError] = useState("");
  const [portfolio, setPortfolio] = useState([]);
  const [portfolioError, setPortfolioError] = useState("");
  const [services, setServices] = useState([]);
  const [servicesError, setServicesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [portfolioDraft, setPortfolioDraft] = useState({ title: "", description: "", imageUrl: "" });

  const refresh = useCallback(async () => {
    const [profileResult, activationResult, portfolioResult, servicesResult] = await Promise.allSettled([
      getMySellerProfile(), getMyActivationStatus(), listMyPortfolio(), listMyServices(),
    ]);
    if ([profileResult, activationResult, portfolioResult, servicesResult].some((result) => result.status === "rejected" && result.reason?.status === 401)) logout();
    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value);
      setValues(editValues(profileResult.value));
      onProfileUpdated?.(profileResult.value);
    } else {
      setError(errorText(profileResult.reason));
    }
    if (activationResult.status === "fulfilled") {
      setActivation(activationResult.value);
      setActivationError("");
      if (activationResult.value.status === "APPROVED") {
        try { await refreshAccount(); } catch (failure) { setActivationError(errorText(failure)); }
      }
    } else {
      setActivation(null);
      setActivationError(errorText(activationResult.reason));
    }
    if (portfolioResult.status === "fulfilled") { setPortfolio(portfolioResult.value); setPortfolioError(""); }
    else { setPortfolio([]); setPortfolioError(errorText(portfolioResult.reason)); }
    if (servicesResult.status === "fulfilled") { setServices(servicesResult.value); setServicesError(""); }
    else { setServices([]); setServicesError(errorText(servicesResult.reason)); }
    setLoading(false);
  }, [logout, onProfileUpdated, refreshAccount]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const locked = loading || !activation || activation.status === "PENDING";

  async function saveProfile(event) {
    event.preventDefault();
    if (busy || locked) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const updated = await updateMySellerProfile({ ...values, specialties: values.specialties, publicLocation: publicLocationFromForm(new FormData(event.currentTarget)) });
      setProfile(updated); setValues(editValues(updated)); onProfileUpdated?.(updated);
      setSuccess("Seller profile saved on Digarsa.");
    } catch (failure) { if (failure?.status === 401) logout(); setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function savePortfolio(event) {
    event.preventDefault();
    if (busy || locked) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const created = await createPortfolioItem(portfolioDraft);
      setPortfolio((current) => [...current, created]);
      setPortfolioDraft({ title: "", description: "", imageUrl: "" });
      setSuccess("Portfolio item saved on Digarsa.");
    } catch (failure) { if (failure?.status === 401) logout(); setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function removePortfolioItem(id) {
    if (busy || locked) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await deletePortfolioItem(id);
      setPortfolio((current) => current.filter((item) => item.id !== id));
      setSuccess("Portfolio item removed.");
    } catch (failure) { if (failure?.status === 401) logout(); setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function requestReview() {
    if (busy || !canSubmitActivation(activation?.status) || activationError) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await submitActivationReview();
      setSuccess("Your preparation was submitted for manual review.");
      await refresh();
    } catch (failure) { if (failure?.status === 401) logout(); setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function withdrawReview() {
    if (busy || !canWithdrawActivation(activation?.status)) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await withdrawActivationReview();
      setSuccess("The pending review was withdrawn. You can update your preparation and submit it again.");
      await refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  function changeProfile(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setError(""); setSuccess("");
  }

  if (loading && !profile) return <section className="seller-prep-panel" role="status">Loading seller preparation…</section>;

  return (
    <div className="seller-prep">
      <section className="seller-prep-panel" aria-labelledby="activation-status-heading">
        <div className="seller-prep-heading">
          <div><span className="market-kicker">SELLER PREPARATION</span><h2 id="activation-status-heading">Manual activation review</h2></div>
          <Button variant="secondary" onClick={() => { setLoading(true); void refresh(); }} disabled={loading || busy}>{loading ? "Refreshing…" : "Refresh status"}</Button>
        </div>
        {activationError ? <p className="seller-prep-error" role="alert">Activation status is unavailable. {activationError}</p> : activation ? <p className={`seller-prep-status is-${activation.status.toLowerCase()}`} role="status">{STATUS_LABELS[activation.status] || activation.status}</p> : <p role="status">Loading activation status…</p>}
        {activation?.review?.rejectionReason && <div className="seller-prep-feedback"><strong>Reviewer feedback</strong><p>{activation.review.rejectionReason}</p></div>}
        {activation?.status === "PENDING" && <p>Review is pending. To change the submitted profile, portfolio, or service offers, withdraw this request first, then update and submit the new snapshot.</p>}
        {activation?.status === "APPROVED" && <p>Seller approval is recorded by Digarsa. Seller capabilities are still provided by the server account session.</p>}
        {activation?.status === "PENDING" && <button className="button button--secondary" type="button" disabled={busy} onClick={withdrawReview}>{busy ? "Working…" : "Withdraw pending review"}</button>}
        {activation && canSubmitActivation(activation.status) && <div className="seller-prep-submit"><p>Review uses the saved seller profile, portfolio, and service-offer snapshot. Digarsa makes the approval decision.</p><button className="button button--primary" type="button" disabled={busy || loading || Boolean(activationError)} onClick={requestReview}>{busy ? "Submitting…" : activation.status === "NOT_SUBMITTED" ? "Request activation review" : "Resubmit for review"}</button></div>}
      </section>

      {error && <p className="seller-prep-error" role="alert">{error}</p>}
      {success && <p className="seller-prep-success" role="status">{success}</p>}

      <section className="seller-prep-panel" aria-labelledby="seller-profile-heading">
        <span className="market-kicker">SAVED TO YOUR SELLER PROFILE</span>
        <h2 id="seller-profile-heading">Seller profile</h2>
        {locked && activation?.status === "PENDING" && <p>Profile editing is paused while this snapshot is under review. Withdraw the request before changing submitted content.</p>}
        <form className="seller-prep-form" onSubmit={saveProfile} aria-busy={busy}>
          <fieldset disabled={busy || locked}>
            <Input label="Creator or studio name" name="name" value={values.name} onChange={(event) => changeProfile("name", event.target.value)} required minLength={2} maxLength={80} />
            <label className="field">Main category<select className="field__control" name="category" value={values.category} onChange={(event) => changeProfile("category", event.target.value)} required>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <Input label="City" name="city" value={values.city} onChange={(event) => changeProfile("city", event.target.value)} required minLength={2} maxLength={80} />
            <label className="field">Short bio<textarea className="field__control" name="bio" value={values.bio} onChange={(event) => changeProfile("bio", event.target.value)} required minLength={30} maxLength={500} rows={4} /></label>
            <Input label="Profile image URL (optional)" name="image" type="url" value={values.image} onChange={(event) => changeProfile("image", event.target.value)} maxLength={2048} />
            <Input label="Portfolio link (optional)" name="portfolioLink" type="url" value={values.portfolioLink} onChange={(event) => changeProfile("portfolioLink", event.target.value)} maxLength={2048} />
            <Input label="Specialties (optional)" name="specialties" value={values.specialties} onChange={(event) => changeProfile("specialties", event.target.value)} hint="Separate specialties with commas; up to 15 entries." />
            <PublicLocationFields initial={profile?.publicLocation} />
            <button className="button button--primary" type="submit">Save seller profile</button>
          </fieldset>
        </form>
      </section>

      <section className="seller-prep-panel" aria-labelledby="portfolio-heading">
        <span className="market-kicker">PORTFOLIO SNAPSHOT</span><h2 id="portfolio-heading">Portfolio items</h2>
        {portfolioError && <p className="seller-prep-error" role="alert">Portfolio could not be loaded. {portfolioError}</p>}
        {!portfolioError && !portfolio.length && <p>No portfolio items are saved. The backend does not define a minimum item count for activation submission.</p>}
        {!!portfolio.length && <ul className="seller-prep-list">{portfolio.map((item) => <li key={item.id}>{item.imageUrl && <img src={item.imageUrl} alt={item.title || "Portfolio work"} loading="lazy" />}<div><strong>{item.title || "Portfolio item"}</strong><p>{item.description || "No description provided."}</p></div><button className="button button--secondary" type="button" disabled={busy || locked} onClick={() => removePortfolioItem(item.id)}>Remove</button></li>)}</ul>}
        <form className="seller-prep-form" onSubmit={savePortfolio} aria-busy={busy}>
          <fieldset disabled={busy || locked}>
            <h3>Add a portfolio item</h3>
            <Input label="Image URL (required)" name="portfolioImageUrl" type="url" value={portfolioDraft.imageUrl} onChange={(event) => setPortfolioDraft((current) => ({ ...current, imageUrl: event.target.value }))} required maxLength={2048} />
            <Input label="Title (optional)" name="portfolioTitle" value={portfolioDraft.title} onChange={(event) => setPortfolioDraft((current) => ({ ...current, title: event.target.value }))} maxLength={120} />
            <label className="field">Description (optional)<textarea className="field__control" value={portfolioDraft.description} onChange={(event) => setPortfolioDraft((current) => ({ ...current, description: event.target.value }))} maxLength={2000} rows={3} /></label>
            <button className="button button--secondary" type="submit">Save portfolio item</button>
          </fieldset>
        </form>
      </section>

      <section className="seller-prep-panel" aria-labelledby="services-heading">
        <span className="market-kicker">SERVICE-OFFER SNAPSHOT</span><h2 id="services-heading">Prepared service offers</h2>
        {servicesError && <p className="seller-prep-error" role="alert">Service offers could not be loaded. {servicesError}</p>}
        {!servicesError && !services.length && <p>No service offers are saved yet. The current backend activation workflow does not enforce a minimum offer count.</p>}
        {!!services.length && <ul className="seller-prep-list seller-prep-services">{services.map((service) => <li key={service.id}><div><strong>{service.title}</strong><p>{service.category} · {service.delivery} · {service.turnaround}</p><p>{service.price === null ? "Price unavailable" : money(service.price)} · {service.availability || "Availability unavailable"}</p><small>Service moderation: {service.moderationStatus || (service.hidden ? "REVIEW REQUIRED" : "Unknown")}{service.hiddenReason ? ` · ${service.hiddenReason}` : ""}</small></div><span className={`seller-prep-status is-${service.moderationStatus?.toLowerCase() || "unknown"}`}>{service.hidden ? "Not publicly available" : service.active ? "Active" : "Inactive"}</span></li>)}</ul>}
        <p className="seller-prep-footnote">Seller activation review and service moderation are separate decisions. This panel does not approve, publish, or change service moderation.</p>
      </section>
    </div>
  );
}

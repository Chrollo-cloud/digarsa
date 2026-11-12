
import LocalImage from "../../features/media/LocalImage";
import { useCatalog } from "../../features/catalog/useCatalog";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCreator, services } from "../../data/marketplace";
import { useAuth } from "../../features/account/authContext";
import PublicReviews from "../../features/reviews/PublicReviews";
import VerifiedRating from "../../features/reviews/VerifiedRating";
import ServiceCard from "../../components/marketplace/ServiceCard";
import PortfolioLink from "../../components/marketplace/PortfolioLink";
import Reviews from "../../components/marketplace/Reviews";
import NotFound from "../../components/marketplace/NotFound";
import "./marketplace.css";

const REPORT_REASONS = [
  "Fraud or suspicious activity",
  "Harassment or inappropriate communication",
  "False identity or profile",
  "Spam or platform abuse",
  "Other",
];

export default function CreatorProfilePage() {
  useCatalog();

  const { id } = useParams();
  const { user, store } = useAuth();

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");

  const creator = getCreator(id);

  useEffect(() => {
    document.title = `${creator?.name || "Creator not found"} — Digarsa`;
  }, [creator]);

  if (!creator) return <NotFound type="Creator" />;

  const listings = services.filter(
    (service) => service.creatorId === creator.id,
  );

  const reviews = listings.flatMap((service) => service.reviews);

  const isOwnProfile =
    Boolean(user?.id) && user.id === creator.ownerUserId;

  function submitReport(event) {
    event.preventDefault();
    setReportError("");
    setReportSuccess("");

    if (!user) {
      setReportError("Silakan masuk ke akun Digarsa terlebih dahulu untuk melaporkan akun.");
      return;
    }

    if (!creator.ownerUserId) {
      setReportError("Identitas pemilik akun tidak tersedia. Laporan belum dapat dikirim.");
      return;
    }

    if (isOwnProfile) {
      setReportError("Anda tidak dapat melaporkan akun sendiri.");
      return;
    }

    try {
      store.submitAccountReport(
        creator.ownerUserId,
        reportReason,
        reportDetails.trim(),
        { expectedUserId: user.id },
      );

      setReportSuccess("Laporan berhasil dikirim dan akan ditinjau oleh administrator Digarsa.");
      setReportDetails("");
      setReportReason(REPORT_REASONS[0]);
      setShowReportForm(false);
    } catch (error) {
      setReportError(error.message || "Laporan gagal dikirim. Silakan coba kembali.");
    }
  }

  return (
    <div className="market-page market-profile">
      <div className="market-shell">
        <nav className="market-breadcrumb" aria-label="Jejak navigasi">
          <Link to="/marketplace">← Marketplace</Link>
          <span>/ Profil kreator</span>
        </nav>

        <div className="market-profile-cover">
          <div className="market-profile-cover__inner">
            <LocalImage
              url={creator.image}
              mediaId={creator.imageMediaId}
              ownerUserId={creator.ownerUserId}
              alt={`Foto sampul ${creator.name}`}
            />
          </div>
        </div>

        <section
          className="market-profile-intro"
          aria-labelledby="creator-name"
        >
          <div className="market-profile-avatar-frame">
            <LocalImage
              className="market-profile-avatar"
              url={creator.image}
              mediaId={creator.imageMediaId}
              ownerUserId={creator.ownerUserId}
              alt={`Foto profil ${creator.name}`}
            />
          </div>

          <div>
            <span className="market-kicker">{creator.role}</span>
            <h1 id="creator-name">{creator.name}</h1>
            <p>
              {creator.city} · <VerifiedRating sellerProfileId={creator.id} />
            </p>
          </div>
        </section>

        <div className="creator-report-actions">
          {!isOwnProfile && (
            <button
              type="button"
              className="creator-report-button"
              onClick={() => {
                setReportError("");
                setReportSuccess("");
                setShowReportForm((current) => !current);
              }}
            >
              Laporkan Akun
            </button>
          )}
        </div>

        {reportSuccess && (
          <p className="creator-report-success" role="status">
            {reportSuccess}
          </p>
        )}

        {showReportForm && (
          <section className="creator-report-panel" aria-labelledby="report-title">
            <h2 id="report-title">Laporkan akun kreator</h2>
            <p>
              Sampaikan alasan laporan secara jelas. Laporan akan diteruskan
              kepada administrator Digarsa untuk ditinjau.
            </p>

            <form onSubmit={submitReport}>
              <label htmlFor="creator-report-reason">
                Alasan laporan
              </label>
              <select
                id="creator-report-reason"
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                required
              >
                {REPORT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>

              <label htmlFor="creator-report-details">
                Keterangan laporan
              </label>
              <textarea
                id="creator-report-details"
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                placeholder="Jelaskan alasan Anda melaporkan akun ini (minimal 10 karakter)."
                minLength={10}
                maxLength={1000}
                rows={5}
                required
              />

              {reportError && (
                <p className="creator-report-error" role="alert">
                  {reportError}
                </p>
              )}

              <div className="creator-report-form-actions">
                <button type="submit" className="creator-report-submit">
                  Kirim Laporan
                </button>
                <button
                  type="button"
                  className="creator-report-cancel"
                  onClick={() => {
                    setShowReportForm(false);
                    setReportError("");
                  }}
                >
                  Batal
                </button>
              </div>
            </form>
          </section>
        )}

        <p className="market-profile-bio">{creator.bio}</p>

        <PortfolioLink url={creator.portfolioLink} />

        {creator.publicLocation?.area && (
          <p>Wilayah services publik: {creator.publicLocation.area}</p>
        )}

        <ul className="market-skills">
          {creator.skills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>

        <section className="market-section" aria-labelledby="creator-services">
          <div className="market-section-head">
            <div>
              <span className="market-kicker">LAYANAN KREATOR</span>
              <h2 id="creator-services">
                Berkarya bersama<span>.</span>
              </h2>
            </div>
            <p>{listings.length} services · termasuk jadwal penuh</p>
          </div>

          <div className="market-service-grid">
            {listings.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>

        <section className="market-section" aria-labelledby="creator-portfolio">
          <h2 id="creator-portfolio">Portfolio pilihan.</h2>
          <div className="market-profile-gallery">
            {creator.portfolio.map((work) => (
              <Link key={work.serviceId} to={`/service/${work.serviceId}`}>
                <img src={work.image} alt={work.alt} loading="lazy" />
                <span>{work.title} </span>
              </Link>
            ))}
          </div>
        </section>

        <PublicReviews sellerProfileId={creator.id} />
        <Reviews reviews={reviews} />

        <p className="market-demo-note">
          Profil dan karya merupakan ilustrasi services kreatif. All data pada
          halaman ini adalah data demo.
        </p>
      </div>
    </div>
  );
}
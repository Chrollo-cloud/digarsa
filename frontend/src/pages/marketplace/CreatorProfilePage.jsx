import LocalImage from "../../features/media/LocalImage";
import { useCatalog } from "../../features/catalog/useCatalog";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getCreator, services } from "../../data/marketplace";
import PublicReviews from "../../features/reviews/PublicReviews";
import VerifiedRating from "../../features/reviews/VerifiedRating";
import ServiceCard from "../../components/marketplace/ServiceCard";
import PortfolioLink from "../../components/marketplace/PortfolioLink";
import Reviews from "../../components/marketplace/Reviews";
import ReportAccountButton from "../../features/account/ReportAccountButton";
import NotFound from "../../components/marketplace/NotFound";
import "./marketplace.css";

export default function CreatorProfilePage() {
  useCatalog();
  const { id } = useParams();
  const creator = getCreator(id);
  useEffect(() => {
    document.title = `${creator?.name || "Kreator tidak ditemukan"} — Digarsa`;
  }, [creator]);
  if (!creator) return <NotFound type="Kreator" />;
  const listings = services.filter(
    (service) => service.creatorId === creator.id,
  );
  const reviews = listings.flatMap((service) => service.reviews);
  return (
    <div className="market-page market-profile">
      <div className="market-shell">
        <nav className="market-breadcrumb" aria-label="Jejak navigasi">
          <Link to="/marketplace">← Marketplace</Link>
          <span>/ Profil kreator</span>
        </nav>
        <div className="market-profile-cover">
          <LocalImage url={creator.image} mediaId={creator.imageMediaId} ownerUserId={creator.ownerUserId} alt="" />
        </div>
        <section
          className="market-profile-intro"
          aria-labelledby="creator-name"
        >
          <LocalImage
            className="market-profile-avatar"
            url={creator.image} mediaId={creator.imageMediaId} ownerUserId={creator.ownerUserId}
            alt={`Visual studio ${creator.name}`}
          />
          <div>
            <span className="market-kicker">{creator.role}</span>
            <h1 id="creator-name">{creator.name}</h1>
            <p>
              {creator.city} · <VerifiedRating sellerProfileId={creator.id} />
            </p>
          </div>
        </section>
        <p className="market-profile-bio">{creator.bio}</p>
        <PortfolioLink url={creator.portfolioLink} />
        {creator.publicLocation?.area && (
          <p>Wilayah layanan publik: {creator.publicLocation.area}</p>
        )}
        <ul className="market-skills">
          {creator.skills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
        <div className="market-profile-report">
          <p>Menemukan sesuatu yang mencurigakan?</p>
          <ReportAccountButton
            targetSellerProfileId={creator.id}
            label="Laporkan Akun Seller"
          />
        </div>
        <section className="market-section" aria-labelledby="creator-services">
          <div className="market-section-head">
            <div>
              <span className="market-kicker">LAYANAN KREATOR</span>
              <h2 id="creator-services">
                Berkarya bersama<span>.</span>
              </h2>
            </div>
            <p>{listings.length} layanan · termasuk jadwal penuh</p>
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
                <span>{work.title} ↗</span>
              </Link>
            ))}
          </div>
        </section>
        <PublicReviews sellerProfileId={creator.id} />
        <Reviews reviews={reviews} />
        <p className="market-demo-note">
          Profil dan karya merupakan ilustrasi layanan kreatif. Semua data pada
          halaman ini adalah data demo.
        </p>
      </div>
    </div>
  );
}

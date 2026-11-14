import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import ServiceCard from "../../components/marketplace/ServiceCard";
import PortfolioLink from "../../components/marketplace/PortfolioLink";
import NotFound from "../../components/marketplace/NotFound";
import { usePublicCreator } from "../../features/catalog/usePublicCatalog";
import "./marketplace.css";

export default function CreatorProfilePage() {
  const { id } = useParams();
  const resource = usePublicCreator(id);
  const creator = resource.data;

  useEffect(() => { document.title = `${creator?.name || "Creator"} — Digarsa`; }, [creator?.name]);

  if (resource.status === "loading") return <div className="market-page market-shell market-panel" role="status">Loading creator profile…</div>;
  if (resource.status === "error") return resource.statusCode === 404 ? <NotFound type="Creator" /> : <div className="market-page market-shell market-panel" role="alert"><h1>Creator profile unavailable.</h1><p>{resource.error}</p><button className="market-reset" type="button" onClick={resource.retry}>Try again</button><Link to="/marketplace">Back to marketplace</Link></div>;
  if (!creator) return <NotFound type="Creator" />;

  const initials = creator.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <div className="market-page market-profile">
      <div className="market-shell">
        <nav className="market-breadcrumb" aria-label="Breadcrumb">
          <Link to="/marketplace">← Marketplace</Link>
          <span>/ Creator profile</span>
        </nav>

        <div className="market-profile-cover">
          <div className="market-profile-cover__inner">
            {creator.image ? <img src={creator.image} alt={`Cover for ${creator.name}`} /> : <div className="market-profile-image-placeholder" role="img" aria-label="Creator image unavailable">DIGARSA</div>}
          </div>
        </div>

        <section className="market-profile-intro" aria-labelledby="creator-name">
          <div className="market-profile-avatar-frame">
            {creator.image ? <img className="market-profile-avatar" src={creator.image} alt={`Profile of ${creator.name}`} /> : <span className="market-profile-avatar market-avatar-placeholder" aria-hidden="true">{initials || "D"}</span>}
          </div>
          <div>
            <span className="market-kicker">{creator.category || "Creator"}</span>
            <h1 id="creator-name">{creator.name}</h1>
            {creator.city && <p>{creator.city}</p>}
          </div>
        </section>

        {creator.bio && <p className="market-profile-bio">{creator.bio}</p>}
        {creator.portfolioLink && <PortfolioLink url={creator.portfolioLink} />}
        {creator.publicLocation?.area && <p>Public area: {creator.publicLocation.area}</p>}
        {!!creator.skills.length && <ul className="market-skills">{creator.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>}

        <section className="market-section" aria-labelledby="creator-services">
          <div className="market-section-head">
            <div>
              <span className="market-kicker">PUBLIC SERVICES</span>
              <h2 id="creator-services">Work with this creator<span>.</span></h2>
            </div>
            <p>{creator.services.length} publicly listed services</p>
          </div>
          {creator.services.length ? (
            <div className="market-service-grid">
              {creator.services.map((service) => <ServiceCard key={service.id} service={{ ...service, creator }} />)}
            </div>
          ) : <p className="market-panel">No public services are listed yet.</p>}
        </section>

        <section className="market-section" aria-labelledby="creator-portfolio">
          <h2 id="creator-portfolio">Portfolio<span>.</span></h2>
          {creator.portfolio.length ? (
            <div className="market-profile-gallery">
              {creator.portfolio.map((work) => <Link key={work.serviceId} to={`/service/${work.serviceId}`}><img src={work.image} alt={work.alt || work.title || "Creator portfolio work"} loading="lazy" /><span>{work.title || "Service work"}</span></Link>)}
            </div>
          ) : <p className="market-panel">No portfolio images are available.</p>}
        </section>
      </div>
    </div>
  );
}

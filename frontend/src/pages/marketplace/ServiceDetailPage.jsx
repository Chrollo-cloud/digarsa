import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { money } from "../../utils/money.js";
import Gallery from "../../components/marketplace/Gallery";
import Availability from "../../components/marketplace/Availability";
import NotFound from "../../components/marketplace/NotFound";
import CatalogRating from "../../features/catalog/CatalogRating";
import ServiceActions from "../../features/customer/ServiceActions.jsx";
import { usePublicCreator, usePublicService } from "../../features/catalog/usePublicCatalog";
import "./marketplace.css";

export default function ServiceDetailsPage() {
  const { id } = useParams();
  const resource = usePublicService(id);
  const service = resource.data;
  const creatorResource = usePublicCreator(service?.creatorId || "");
  const creator = creatorResource.data;
  useEffect(() => {
    document.title = `${service?.title || "Service"} — Digarsa`;
  }, [service]);
  if (resource.status === "loading") return <div className="market-page market-shell market-panel" role="status">Loading service…</div>;
  if (resource.status === "error") return resource.statusCode === 404 ? <NotFound type="Service" /> : <div className="market-page market-shell market-panel" role="alert"><h1>Service unavailable.</h1><p>{resource.error}</p><button className="market-reset" type="button" onClick={resource.retry}>Try again</button><Link to="/marketplace">Back to marketplace</Link></div>;
  if (!service) return <NotFound type="Service" />;
  return (
    <div className="market-page market-detail">
      <div className="market-shell">
        <nav className="market-breadcrumb" aria-label="Jejak navigasi">
          <Link to="/marketplace">← Marketplace</Link>
          <span>/ {service.category}</span>
        </nav>
        <div className="market-detail-grid">
          <div>
            <Gallery
              key={service.id}
              images={service.images}
              title={service.title}
            />
            <section className="market-detail-copy">
              <span className="market-kicker">{service.category || "Creative service"}</span>
              <h1>{service.title}</h1>
              <p>
                <CatalogRating rating={service.avgRating} count={service.reviewCount} />
              </p>
              <p>{service.description}</p>
            </section>
            <section className="market-section">
              <h2>About pengerjaan</h2>
              <div className="market-panel">
                <p>
                  <strong>{service.delivery || "Delivery details unavailable"}</strong> ·{" "}
                  {service.delivery === "Onsite"
                  ? `Onsite in ${service.publicLocation?.area || service.city || "the creator's area"}. Exact details can be discussed with the creator.`
                    : service.delivery === "Remote"
                      ? "Kolaborasi dan pengiriman hasil secara daring."
                      : "Work mode belum didukung."}
                </p>
                {service.turnaround && <p>Turnaround: {service.turnaround}</p>}
              </div>
            </section>
          </div>
          <aside className="market-detail-aside" aria-label="Overview services">
            <div className="market-panel">
              <Availability value={service.availability} />
              <p>Service price</p>
              <strong className="market-detail-price">{service.price === null ? "Price unavailable" : money(service.price)}</strong>
              <p>{service.delivery || "Delivery details unavailable"} · {service.turnaround || "Turnaround unavailable"}</p>
              {service.bookable ? <Link className="button button--primary market-future" to={`/booking/${encodeURIComponent(service.id)}`}>
                Request this service
              </Link> : <button className="button button--primary market-future" type="button" disabled>
                Currently unavailable for booking
              </button>}
              <ServiceActions service={service} />
              <p className="market-demo-note">
                {service.availability === "Full-book" ? "This service is currently fully booked. " : ""}
                Availability is checked again by the server when you submit a booking request.
              </p>
            </div>
            <Link
              className="market-panel market-identity"
              to={`/seller/${service.creatorId}`}
            >
              {creator?.image ? <img src={creator.image} alt="" /> : <span className="market-avatar-placeholder" aria-hidden="true">{(service.studio || "D").slice(0, 1).toUpperCase()}</span>}
              <span>
                <small>KREATOR</small>
                <strong>{creator?.name || service.studio || "Creator"}</strong>
                <small>{creator?.city || service.city}</small>
              </span>
            <span aria-hidden="true">→</span>
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

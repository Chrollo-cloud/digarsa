import { Link } from "react-router-dom";
import { money } from "../../utils/money.js";
import CatalogRating from "../../features/catalog/CatalogRating";
import Availability from "./Availability";
import ServiceActions from "../../features/customer/ServiceActions.jsx";

export default function ServiceCard({ service }) {
  const creator = service.creator;
  if (!creator) return null;
  const initials = creator.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <article className="market-card">
      <Link
        className="market-card__image"
        to={`/service/${service.id}`}
        aria-label={`Show services ${service.title}, ${service.availability}`}
      >
        {service.image ? <img src={service.image} alt={service.alt || service.title} loading="lazy" /> : <span className="market-image-placeholder" role="img" aria-label="Service image unavailable">DIGARSA</span>}
        <Availability value={service.availability} />
      </Link>
      <div className="market-card__body">
        <div className="market-card__meta">
          <span className="market-kicker">{service.category}</span>
          <CatalogRating rating={service.avgRating} count={service.reviewCount} />
        </div>
        <h3>
          <Link to={`/service/${service.id}`}>{service.title}</Link>
        </h3>
        <Link className="market-identity" to={`/seller/${creator.id}`}>
          {creator.image ? <img src={creator.image} alt="" loading="lazy" /> : <span className="market-avatar-placeholder" aria-hidden="true">{initials || "D"}</span>}
          <span>
            <strong>{creator.name}</strong>
            <small>{creator.city}</small>
          </span>
          <span aria-hidden="true"></span>
        </Link>
        <div className="market-card__price">
          <span>Mulai dari</span>
          <strong>{service.price === null ? "Price unavailable" : money(service.price)}</strong>
        </div>
        <ServiceActions service={service} />
      </div>
    </article>
  );
}

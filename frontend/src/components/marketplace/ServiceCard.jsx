import { Link } from "react-router-dom";
import { getCreator, money } from "../../data/marketplace";
import VerifiedRating from "../../features/reviews/VerifiedRating";
import Availability from "./Availability";
import ServiceActions from "../../features/customer/ServiceActions";

export default function ServiceCard({ service }) {
  const creator = getCreator(service.creatorId);
  return (
    <article className="market-card">
      <Link
        className="market-card__image"
        to={`/service/${service.id}`}
        aria-label={`Show services ${service.title}, ${service.availability}`}
      >
        <img src={service.image} alt={service.alt} loading="lazy" />
        <Availability value={service.availability} />
      </Link>
      <div className="market-card__body">
        <div className="market-card__meta">
          <span className="market-kicker">{service.category}</span>
          <VerifiedRating serviceId={service.id} compact />
        </div>
        <h3>
          <Link to={`/service/${service.id}`}>{service.title}</Link>
        </h3>
        <Link className="market-identity" to={`/seller/${creator.id}`}>
          <img src={creator.image} alt="" />
          <span>
            <strong>{creator.name}</strong>
            <small>{creator.city}</small>
          </span>
          <span aria-hidden="true"></span>
        </Link>
        <div className="market-card__price">
          <span>Mulai dari</span>
          <strong>{money(service.price)}</strong>
        </div>
        <ServiceActions service={service} />
      </div>
    </article>
  );
}

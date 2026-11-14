import { Link } from "react-router-dom";
import { money } from "../../utils/money.js";
import Availability from "../../components/marketplace/Availability";

export default function SavedServiceCard({ service, id, available = true, onRemove, pending = false, removeLabel = "Remove from favorites" }) {
  return (
    <article className="saved-service-card">
      {service && (
        <Link className="saved-service-image" to={`/service/${service.id}`} tabIndex={-1} aria-hidden="true">
          <img src={service.image} alt="" loading="lazy" />
        </Link>
      )}
      <div className="saved-service-content">
        {service ? (
          <>
            <Availability value={service.availability} />
            <h2><Link to={`/service/${service.id}`}>{service.title}</Link></h2>
            <p>{service.creator?.name || "Creator unavailable"}{service.creator?.city ? ` · ${service.creator.city}` : ""}</p>
            {service.price !== null && <strong>{money(service.price)} <small>/ starting price</small></strong>}
            {!available && <p role="status">This service is currently unavailable for booking.</p>}
          </>
        ) : (
          <>
            <h2>Service unavailable.</h2>
            <p>The service is no longer publicly available. You can remove this saved item.</p>
          </>
        )}
      </div>
      {onRemove && (
        <button className="saved-service-remove" type="button"
          aria-label={`${removeLabel}: ${service?.title || id}`}
          disabled={pending}
          onClick={() => onRemove(id)}>
          ♥
        </button>
      )}
    </article>
  );
}

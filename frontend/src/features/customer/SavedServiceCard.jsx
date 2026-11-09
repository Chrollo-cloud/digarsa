import { Link } from "react-router-dom";
import { getCreator, money } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";

export default function SavedServiceCard({ service, id, onRemove }) {
  const creator = service && getCreator(service.creatorId);
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
            <p>{creator?.name || "Kreator tidak tersedia"}{creator?.city ? ` · ${creator.city}` : ""}</p>
            <strong>{money(service.price)} <small>/ mulai dari</small></strong>
          </>
        ) : (
          <>
            <h2>Layanan tidak tersedia.</h2>
            <p>Kamu tetap dapat menghapusnya dari favorit.</p>
          </>
        )}
      </div>
      {onRemove && (
        <button className="saved-service-remove" type="button"
          aria-label={`Hapus dari favorit: ${service?.title || id}`}
          onClick={() => onRemove(id)}>
          ♥
        </button>
      )}
    </article>
  );
}

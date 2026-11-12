import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";
export default function BookingSummary({ service, creator }) {
  return (
    <aside className="customer-booking-summary">
      <img src={service.image} alt={service.alt} />
      <span className="market-kicker">RINGKASAN LAYANAN</span>
      <h2>{service.title}</h2>
      <Link to={`/seller/${creator.id}`}>{creator.name}</Link>
      <p>
        {service.delivery === "Onsite" ? "On-site" : "Remote"} · {service.turnaround}
      </p>
      <Availability value={service.availability} />
      <p>Starting price estimate</p>
      <strong>{money(service.price)}</strong>
      <p>
        This is an estimate, not a charge. Discuss the scope and final price with the creator. Submitting a request does not trigger a payment.
      </p>
    </aside>
  );
}

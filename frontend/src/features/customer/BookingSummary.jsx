import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";
export default function BookingSummary({ service, creator }) {
  return (
    <aside className="customer-booking-summary">
      <img src={service.image} alt={service.alt} />
      <span className="market-kicker">RINGKASAN LAYANAN</span>
      <h2>{service.title}</h2>
      <Link to={`/seller/${creator.id}`}>{creator.name} ↗</Link>
      <p>
        {service.delivery === "Onsite" ? "Di lokasi" : "Daring"} · {service.turnaround}
      </p>
      <Availability value={service.availability} />
      <p>Estimasi harga mulai dari</p>
      <strong>{money(service.price)}</strong>
      <p>
        Harga awal, bukan tagihan. Ruang lingkup dan harga akhir dibahas dengan
        kreator. Mengirim permintaan tidak memicu pembayaran.
      </p>
    </aside>
  );
}

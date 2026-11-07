import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { services, getCreator, money, rating } from "../../data/marketplace";
import Gallery from "../../components/marketplace/Gallery";
import Availability from "../../components/marketplace/Availability";
import Reviews from "../../components/marketplace/Reviews";
import NotFound from "../../components/marketplace/NotFound";
import "./marketplace.css";

export default function ServiceDetailPage() {
  const { id } = useParams();
  const service = services.find((item) => item.id === id);
  useEffect(() => {
    document.title = `${service?.title || "Layanan tidak ditemukan"} — Digarsa`;
  }, [service]);
  if (!service) return <NotFound type="Layanan" />;
  const creator = getCreator(service.creatorId);
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
              <span className="market-kicker">{service.category}</span>
              <h1>{service.title}</h1>
              <p>
                ★ {rating(service.reviews)} · {service.reviews.length} ulasan
                demo
              </p>
              <p>{service.description}</p>
            </section>
            <section className="market-section">
              <h2>Tentang pengerjaan</h2>
              <div className="market-panel">
                <p>
                  <strong>{service.delivery}</strong> ·{" "}
                  {service.delivery === "Onsite"
                    ? `Produksi di ${creator.city}; lokasi dibahas bersama kreator.`
                    : "Kolaborasi dan pengiriman hasil secara daring."}
                </p>
                <p>
                  Estimasi pengerjaan: {service.turnaround} setelah brief
                  disepakati.
                </p>
                <p>
                  Harga awal adalah acuan. Ruang lingkup, revisi, dan hasil
                  akhir dibahas sebelum proyek dimulai.
                </p>
              </div>
            </section>
            <Reviews reviews={service.reviews} />
          </div>
          <aside className="market-detail-aside" aria-label="Ringkasan layanan">
            <div className="market-panel">
              <Availability value={service.availability} />
              <p>Mulai dari</p>
              <strong className="market-detail-price">
                {money(service.price)}
              </strong>
              <p>
                {service.delivery} · {service.turnaround}
              </p>
              <button className="button button--primary market-future" disabled>
                Booking — segera hadir
              </button>
              <button
                className="button button--secondary market-future"
                disabled
              >
                Pesan kreator — segera hadir
              </button>
              <p className="market-demo-note">
                {service.availability === "Full-book"
                  ? "Jadwal kreator sedang penuh. "
                  : ""}
                Booking dan percakapan belum tersedia pada tahap ini.
              </p>
            </div>
            <Link
              className="market-panel market-identity"
              to={`/seller/${creator.id}`}
            >
              <img src={creator.image} alt="" />
              <span>
                <small>KREATOR</small>
                <strong>{creator.name}</strong>
                <small>{creator.city}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

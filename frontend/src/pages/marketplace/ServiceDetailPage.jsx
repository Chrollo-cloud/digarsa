import { useCatalog } from "../../features/catalog/useCatalog";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { services, getCreator, money } from "../../data/marketplace";
import PublicReviews from "../../features/reviews/PublicReviews";
import VerifiedRating from "../../features/reviews/VerifiedRating";
import Gallery from "../../components/marketplace/Gallery";
import Availability from "../../components/marketplace/Availability";
import Reviews from "../../components/marketplace/Reviews";
import NotFound from "../../components/marketplace/NotFound";
import ServiceActions from "../../features/customer/ServiceActions";
import { customerStore } from "../../features/customer/customerClient";
import { useAuth } from "../../features/account/authContext";
import ContactCreator from "../../features/messaging/ContactCreator";
import "./marketplace.css";

export default function ServiceDetailsPage() {
  useCatalog();
  const { id } = useParams();
  const { user } = useAuth();
  const service = services.find((item) => item.id === id);
  useEffect(() => {
    document.title = `${service?.title || "Service not found"} — Digarsa`;
  }, [service]);
  if (!service) return <NotFound type="Service" />;
  const creator = getCreator(service.creatorId);
  const reason = customerStore.getBookingRestriction(service.id);
  const demoSeller = customerStore.getDemoBookingSellerProfile(service.id);
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
                <VerifiedRating serviceId={service.id} />
              </p>
              <p>{service.description}</p>
            </section>
            <section className="market-section">
              <h2>About pengerjaan</h2>
              <div className="market-panel">
                <p>
                  <strong>{service.delivery}</strong> ·{" "}
                  {service.delivery === "Onsite"
                    ? `Produksi di ${service.publicLocation?.area || creator.city}; lokasi dibahas bersama kreator.`
                    : service.delivery === "Remote"
                      ? "Kolaborasi dan pengiriman hasil secara daring."
                      : "Work mode belum didukung."}
                </p>
                <p>
                  Estimated turnaround: {service.turnaround} setelah brief
                  disepakati.
                </p>
                <p>
                  Harga awal adalah acuan. Ruang lingkup, revisi, dan hasil
                  akhir dibahas sebelum proyek dimulai.
                </p>
              </div>
            </section>
            <PublicReviews serviceId={service.id} />
            <Reviews reviews={service.reviews} />
          </div>
          <aside className="market-detail-aside" aria-label="Overview services">
            <div className="market-panel">
              <Availability value={service.availability} />
              <p>Mulai dari</p>
              <strong className="market-detail-price">
                {money(service.price)}
              </strong>
              <p>
                {service.delivery} · {service.turnaround}
              </p>
              {reason ? (
                <>
                  <button
                    className="button button--primary market-future"
                    disabled
                  >
                    Booking tidak tersedia
                  </button>
                  <p className="market-demo-note">{reason}</p>
                </>
              ) : (
                <Link
                  className="button button--primary market-future"
                  to={`/booking/${service.id}`}
                >
                  Submit a booking request
                </Link>
              )}
              {demoSeller && <p className="market-demo-note">Contoh editorial ini dapat dipesan dalam demo lokal. Permintaan diteruskan ke akun Seller demo {demoSeller.name}; kreator contoh bukan identitas terverifikasi.</p>}
              <ServiceActions service={service} />
              <ContactCreator
                key={`${user?.id || "guest"}-${service.id}`}
                sellerProfileId={service.creatorId}
                serviceId={service.id}
              />
              <p className="market-demo-note">
                {service.availability === "Full-book"
                  ? "Jadwal kreator sedang penuh. "
                  : ""}
                Permintaan belum merupakan kesepakatan atau pembayaran.
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
              <span aria-hidden="true"></span>
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

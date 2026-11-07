import { useState } from "react";
import { Link } from "react-router-dom";
import { services, getCreator, money } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";
import { bookingRestriction } from "./customerStore";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";

export default function CartPage() {
  const { user, cart, store } = useCustomer();
  const [error, setError] = useState("");
  function remove(id) {
    try {
      store.removeFromCart(id);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <CustomerFrame
      title="Pertimbangkan dengan tenang."
      description="Daftar pertimbangan layanan kreatif. Setiap layanan diajukan sebagai permintaan terpisah."
    >
      {error && (
        <p role="alert" className="customer-warning">
          {error}
        </p>
      )}
      {cart.length ? (
        <div className="customer-cart-layout">
          <div className="customer-cart-list">
            {cart.map((id) => {
              const service = services.find((item) => item.id === id);
              const creator = service && getCreator(service.creatorId);
              const reason = bookingRestriction(service, user, creator);
              return (
                <article className="customer-cart-item" key={id}>
                  {service ? (
                    <>
                      <img src={service.image} alt={service.alt} />
                      <div>
                        <Availability value={service.availability} />
                        <h2>
                          <Link to={`/service/${id}`}>{service.title}</Link>
                        </h2>
                        <Link to={`/seller/${creator.id}`}>{creator.name}</Link>
                        <p>
                          {service.delivery} · {creator.city}
                        </p>
                        <strong>{money(service.price)}</strong>
                      </div>
                    </>
                  ) : (
                    <div>
                      <h2>Layanan tidak tersedia.</h2>
                    </div>
                  )}
                  <div className="customer-cart-actions">
                    <button type="button" onClick={() => remove(id)}>
                      Hapus dari pertimbangan
                    </button>
                    {reason ? (
                      <p>{reason}</p>
                    ) : (
                      <Link
                        className="button button--primary"
                        to={`/booking/${id}`}
                      >
                        Ajukan permintaan ↗
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <aside className="customer-cart-note">
            <span className="market-kicker">DAFTAR PERTIMBANGAN</span>
            <h2>{cart.length} layanan</h2>
            <p>
              Bandingkan gaya, harga awal, dan cara pengerjaan. Tidak ada
              checkout gabungan atau pembayaran otomatis.
            </p>
            <Link to="/marketplace">Temukan layanan lain ↗</Link>
          </aside>
        </div>
      ) : (
        <EmptyState title="Belum ada layanan yang dipertimbangkan.">
          Tambahkan layanan dari marketplace, lalu ajukan brief satu per satu.
        </EmptyState>
      )}
    </CustomerFrame>
  );
}

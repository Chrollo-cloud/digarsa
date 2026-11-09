import { useCatalog } from "../catalog/useCatalog";
import { useState } from "react";
import { Link } from "react-router-dom";
import { services, getCreator, money } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";

export default function CartPage() {
  useCatalog();
  const { cart, store } = useCustomer();
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
      title="Keranjang layananmu."
      description="Layanan yang kamu pilih untuk booking. Setiap layanan diajukan sebagai permintaan terpisah."
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
              const reason = store.getBookingRestriction(id);
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
                        {creator ? <Link to={`/seller/${creator.id}`}>{creator.name}</Link> : <span>Kreator tidak tersedia</span>}
                        <p>
                          {service.delivery}{creator?.city ? ` · ${creator.city}` : ""}
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
                      Hapus dari keranjang
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
            <span className="market-kicker">KERANJANG LAYANAN</span>
            <h2>Pilihan untuk karyamu.</h2>
            <dl className="customer-cart-facts"><div><dt>Layanan dipilih</dt><dd>{cart.length}</dd></div><div><dt>Pengajuan</dt><dd>Satu per layanan</dd></div></dl>
            <p>
              Bandingkan gaya, harga awal, dan cara pengerjaan. Tidak ada
              checkout gabungan atau pembayaran otomatis.
            </p>
            <Link to="/marketplace">Temukan layanan lain ↗</Link>
          </aside>
        </div>
      ) : (
        <EmptyState title="Belum ada layanan yang dipilih.">
          Tambahkan layanan dari marketplace, lalu ajukan brief satu per satu.
        </EmptyState>
      )}
    </CustomerFrame>
  );
}

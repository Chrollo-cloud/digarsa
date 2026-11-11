import { useMemo, useState } from "react";
import { useCatalog } from "../catalog/useCatalog";
import { Link } from "react-router-dom";
import { getCreator, money, services } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";

export default function CartPage() {
  useCatalog();
  const { cart, store } = useCustomer();
  const [selectedIds, setSelected] = useState(() => [...cart]);
  const selected = selectedIds.filter((id) => cart.includes(id));
  const [error, setError] = useState("");
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const id of cart) {
      const service = services.find((item) => item.id === id);
      const creator = service && getCreator(service.creatorId);
      const key = creator?.id || "unavailable";
      if (!grouped.has(key)) grouped.set(key, { creator, items: [] });
      grouped.get(key).items.push({ id, service, creator });
    }
    return [...grouped.values()];
  }, [cart]);
  const picked = selected
    .map((id) => services.find((service) => service.id === id))
    .filter(Boolean);
  const subtotal = picked.reduce((sum, service) => sum + service.price, 0);
  const checkoutParams = new URLSearchParams();
  selected.forEach((id) => checkoutParams.append("service", id));
  const canCheckout = selected.length > 0 && selected.every((id) => {
    const service = services.find((item) => item.id === id);
    return service && !store.getBookingRestriction(id);
  });

  function toggle(id) {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }
  function remove(id) {
    try {
      store.removeFromCart(id);
      setSelected((current) => current.filter((item) => item !== id));
      setError("");
    } catch (failure) {
      setError(failure.message || "Layanan belum dapat dihapus.");
    }
  }

  return (
    <CustomerFrame
      title="Rencanakan kolaborasimu."
      description="Pilih satu atau beberapa layanan. Setiap Seller akan meninjau booking masing-masing sebelum pembayaran tersedia."
    >
      {error && <p role="alert" className="customer-warning">{error}</p>}
      {cart.length ? (
        <div className="customer-cart-layout">
          <div className="customer-cart-list">
            {groups.map(({ creator, items }) => (
              <section className="customer-cart-seller-group" key={creator?.id || "unavailable"}>
                <header><span className="market-kicker">SELLER</span><h2>{creator?.name || "Layanan tidak tersedia"}</h2></header>
                {items.map(({ id, service, creator: owner }) => {
                  const reason = service && store.getBookingRestriction(id);
                  return (
                    <article className="customer-cart-item" key={id}>
                      {service ? (
                        <>
                          <label className="customer-cart-select">
                            <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} aria-label={`Pilih ${service.title}`} />
                            <span>Pilih</span>
                          </label>
                          <img src={service.image} alt={service.alt || service.title} />
                          <div className="customer-cart-copy">
                            <Availability value={service.availability} />
                            <h3><Link to={`/service/${id}`}>{service.title}</Link></h3>
                            <Link to={`/seller/${owner?.id}`}>{owner?.name || "Seller Digarsa"}</Link>
                            <p>{service.delivery} · {owner?.city || "Lokasi dibahas bersama"}</p>
                            <strong>{money(service.price)}</strong>
                          </div>
                          <div className="customer-cart-actions">
                            {reason && <p className="customer-warning">{reason}</p>}
                            <button type="button" onClick={() => remove(id)}>Hapus</button>
                          </div>
                        </>
                      ) : (
                        <div><h3>Layanan tidak tersedia.</h3><button type="button" onClick={() => remove(id)}>Hapus dari cart</button></div>
                      )}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
          <aside className="customer-cart-note">
            <span className="market-kicker">RINGKASAN CHECKOUT</span>
            <h2>{selected.length} layanan dipilih</h2>
            <dl><dt>Subtotal harga awal</dt><dd>{money(subtotal)}</dd><dt>Biaya tambahan</dt><dd>{money(0)}</dd><dt>Total estimasi</dt><dd><strong>{money(subtotal)}</strong></dd></dl>
            <p>Harga final dan pembayaran dibahas per booking setelah Seller menerima permintaan. Layanan yang tidak dipilih tidak ikut dikirim.</p>
            {canCheckout ? (
              <Link className="button button--primary" to={`/checkout?${checkoutParams.toString()}`}>Lanjut ke Checkout ↗</Link>
            ) : (
              <button className="button button--primary" type="button" disabled>
                {selected.length ? "Periksa layanan yang dipilih" : "Pilih layanan untuk checkout"}
              </button>
            )}
            <Link to="/marketplace">Temukan layanan lain ↗</Link>
          </aside>
        </div>
      ) : (
        <EmptyState title="Cart masih kosong.">Tambahkan layanan dari marketplace. Kamu bisa memilih beberapa layanan lalu mengirim booking per Seller.</EmptyState>
      )}
    </CustomerFrame>
  );
}

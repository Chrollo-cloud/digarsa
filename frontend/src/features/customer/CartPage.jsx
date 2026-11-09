import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { services, creators, money } from "../../data/marketplace";
import Availability from "../../components/marketplace/Availability";
import { useCatalog } from "../catalog/useCatalog";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";
import { cartSelection, checkoutGroups, checkoutTotal, checkoutDestination } from "./checkoutModel";
import "./checkout.css";

export default function CartPage() {
  const { user } = useCustomer();
  return <CartContents key={user.id} />;
}
function CartContents() {
  useCatalog();
  const { cart, store, error: storageError } = useCustomer();
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const chosen = cartSelection(cart, selected, id => store.getBookingRestriction(id));
  const demoSellers = new Map(cart.map(id => [id, store.getDemoBookingSellerProfile(id)]).filter(([, seller]) => seller));
  const groupedServices = services.map(service => {
    const seller = demoSellers.get(service.id);
    return seller ? { ...service, creatorId: seller.id } : service;
  });
  const groupedCreators = [...creators, ...[...demoSellers.values()].map(seller => ({ ...seller, demoFixture: true }))];
  const groups = checkoutGroups(cart, groupedServices, groupedCreators);
  function remove(id) {
    try {
      store.removeFromCart(id);
      setSelected(value => value.filter(item => item !== id));
      setError("");
    } catch (failure) { setError(failure.message); }
  }
  return (
    <CustomerFrame title="Keranjang layananmu."
      description="Pilih layanan untuk kolaborasimu. Setiap layanan menjadi pesanan terpisah, termasuk saat kreatornya berbeda.">
      {error && <p role="alert" className="customer-warning">{error}</p>}
      {cart.length ? (
        <div className="checkout-layout">
          <section className="checkout-services" aria-label="Layanan di keranjang">
            <div className="checkout-toolbar">
              <button type="button" className="location-link" disabled={!!storageError}
                onClick={() => setSelected(cart.filter(id => !store.getBookingRestriction(id)))}>Pilih semua yang tersedia</button>
              <button type="button" className="location-link" onClick={() => setSelected([])}>Batal pilih semua</button>
              <span role="status">{chosen.length} dipilih</span>
            </div>
            {groups.map(group => (
              <section className="checkout-seller" key={group.id}>
                <h2>{group.creator?.name || "Kreator tidak tersedia"}</h2>
                {group.creator?.demoFixture && <p className="customer-warning">Layanan contoh editorial. Permintaan akan masuk ke akun Seller demo ini; kreator contoh tidak dinyatakan terverifikasi.</p>}
                {group.items.map(({ id, service }) => {
                  const reason = store.getBookingRestriction(id);
                  return (
                    <article className="checkout-cart-row" key={id}>
                      <input type="checkbox" aria-label={`Pilih ${service?.title || "layanan tidak tersedia"}`}
                        checked={chosen.includes(id)} disabled={!!reason || !!storageError}
                        onChange={event => setSelected(value => event.target.checked ? [...value, id] : value.filter(item => item !== id))} />
                      {service?.image && <img src={service.image} alt={service.alt || service.title} />}
                      <div className="checkout-cart-info">
                        {service ? <>
                          <Availability value={service.availability} />
                          <h3><Link to={`/service/${id}`}>{service.title}</Link></h3>
                          <strong>{money(service.price)}</strong>
                        </> : <h3>Layanan tidak tersedia.</h3>}
                        {reason && <p className="checkout-unavailable">{reason}</p>}
                        <div className="checkout-row-actions">
                          <button type="button" className="location-link" onClick={() => remove(id)}>Hapus dari keranjang</button>
                          {!reason && <Link to={`/booking/${id}`}>Ajukan satu layanan →</Link>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </section>
          <aside className="checkout-summary" aria-label="Ringkasan pilihan">
            <span className="market-kicker">RENCANA KOLABORASI</span>
            <h2>Pilihanmu.</h2>
            <dl><div><dt>Layanan dipilih</dt><dd>{chosen.length}</dd></div>
              <div><dt>Estimasi subtotal</dt><dd>{money(checkoutTotal(chosen, services))}</dd></div></dl>
            {chosen.length > 20 && <p role="alert">Pilih maksimal 20 layanan per checkout.</p>}
            <p>Harga awal adalah estimasi. Setiap Seller mengonfirmasi harga akhir saat menerima pesanan. Belum ada pembayaran.</p>
            <button type="button" className="button button--primary" disabled={!chosen.length || chosen.length > 20 || !!storageError}
              onClick={() => navigate(checkoutDestination(chosen, `checkout-${crypto.randomUUID()}`))}>Lanjut ke checkout →</button>
            <Link to="/marketplace">Temukan layanan lain ↗</Link>
          </aside>
        </div>
      ) : <EmptyState title="Keranjangmu masih kosong.">Tambahkan layanan dari marketplace untuk memulai kolaborasi.</EmptyState>}
    </CustomerFrame>
  );
}

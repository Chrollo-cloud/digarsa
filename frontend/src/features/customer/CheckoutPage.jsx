import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { services, creators, money } from "../../data/marketplace";
import { useCatalog } from "../catalog/useCatalog";
import { customerMessaging } from "../messaging/customerMessagingClient";
import Input from "../../components/ui/Input";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import { useCustomer } from "./useCustomer";
import { localToday } from "./customerStore";
import { checkoutGroups, checkoutTotal, parseCheckout } from "./checkoutModel";
import "./checkout.css";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const { user } = useCustomer();
  let selection;
  try { selection = parseCheckout(params); }
  catch (failure) {
    return <CustomerFrame title="Tinjau pilihanmu."><EmptyState title={failure.message} to="/cart" label="Kembali ke keranjang" /></CustomerFrame>;
  }
  return <CheckoutForm key={`${user.id}-${params}`} {...selection} />;
}
function CheckoutForm({ ids, checkoutId }) {
  useCatalog();
  const { user, store, bookings, error: storageError } = useCustomer();
  const [draft, setDraft] = useState(null);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState(null);
  const [notificationWarning, setNotificationWarning] = useState(false);
  const lock = useRef(false);
  const heading = useRef(null);
  const demoSellers = new Map(ids.map(id => [id, store.getDemoBookingSellerProfile(id)]).filter(([, seller]) => seller));
  const groupedServices = services.map(service => {
    const seller = demoSellers.get(service.id);
    return seller ? { ...service, creatorId: seller.id } : service;
  });
  const groupedCreators = [...creators, ...[...demoSellers.values()].map(seller => ({ ...seller, demoFixture: true }))];
  const groups = checkoutGroups(ids, groupedServices, groupedCreators);
  const existing = bookings.filter(row => row.checkoutId === checkoutId);
  const completed = result || (existing.length === ids.length && ids.every(id => existing.some(row => row.serviceId === id)) ? existing : null);

  function review(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const entries = ids.map(serviceId => ({ serviceId, input: Object.fromEntries(
        ["requirements", "description", "requestedDate", "location"].map(key => [key, form.get(`${serviceId}:${key}`) || ""])) }));
      entries.forEach(row => store.validateBooking(row.serviceId, row.input));
      setDraft(entries);
      setFailure("");
      window.requestAnimationFrame(() => heading.current?.focus());
    } catch (error) { setFailure(error.message); }
  }
  function confirm() {
    if (lock.current) return;
    lock.current = true;
    try {
      const saved = store.submitCheckout(draft, { checkoutId, confirmed: true, expectedUserId: user.id });
      let failed = false;
      for (const booking of saved) {
        if (booking.status !== "Requested") continue;
        try { customerMessaging.notifyRequested(booking.id); } catch { failed = true; }
      }
      setNotificationWarning(failed);
      setResult(saved);
      setFailure("");
    } catch (error) {
      setFailure(`${error.message} Sebelum mencoba lagi, periksa pesanan tersimpan. Gunakan checkout ini untuk mengulang dengan aman, bukan checkout baru.`);
    } finally { lock.current = false; }
  }
  return (
    <CustomerFrame title={completed ? "Permintaan terkirim." : "Rencanakan setiap kolaborasi."}
      description="Satu layanan, satu pesanan. Harga akhir dan keputusan setiap Seller tetap independen.">
      <Link className="customer-back" to="/cart">← Kembali ke keranjang</Link>
      {completed ? <section className="checkout-seller" role="status">
        <h2>{completed.length} pesanan tersimpan.</h2>
        <p>Belum ada pembayaran. Seller akan meninjau kebutuhan dan mengonfirmasi harga akhir.</p>
        {notificationWarning && <p className="customer-warning">Pesanan tersimpan, tetapi sebagian notifikasi belum terkirim.
          <button type="button" className="location-link" onClick={confirm}>Coba lagi notifikasi</button></p>}
        <ul>{completed.map(row => <li key={row.id}><Link to={`/orders/${row.id}`}>{row.serviceTitle} →</Link></li>)}</ul>
        <Link className="button button--primary" to="/orders">Lihat semua pesanan</Link>
      </section> : <div className="checkout-layout">
        <form onSubmit={review} className="checkout-services">
          <fieldset disabled={!!storageError} hidden={!!draft}>
            {groups.map(group => <section className="checkout-seller" key={group.id}>
              <span className="market-kicker">SELLER</span><h2>{group.creator?.name || "Kreator tidak tersedia"}</h2>
              {group.creator?.demoFixture && <p className="customer-warning">Layanan contoh editorial. Permintaan ditangani akun Seller demo ini, bukan kreator terverifikasi.</p>}
              {group.items.map(({ id, service }) => {
                const reason = store.getBookingRestriction(id);
                return <section className="checkout-brief" key={id}>
                  <h3>{service?.title || "Layanan tidak tersedia"}</h3>
                  {reason ? <p className="customer-warning">{reason}</p> : <>
                    <p>Estimasi awal {money(service.price)} · {service.delivery === "Onsite" ? "Di lokasi" : "Daring"}</p>
                    <label className="field">Kebutuhan proyek — {service.title}
                      <textarea className="field__control" name={`${id}:requirements`} required minLength={10} maxLength={2000} rows={3} />
                    </label>
                    <label className="field">Deskripsi proyek — {service.title}
                      <textarea className="field__control" name={`${id}:description`} required minLength={20} maxLength={5000} rows={4} />
                    </label>
                    <Input label={`Tanggal yang diminta — ${service.title}`} name={`${id}:requestedDate`}
                      type="date" required min={localToday()} />
                    {service.delivery.toLowerCase() === "onsite" && <Input label={`Lokasi proyek — ${service.title}`}
                      name={`${id}:location`} required minLength={10} maxLength={500} />}
                  </>}
                </section>;
              })}
            </section>)}
            <button type="submit" className="button button--primary">Tinjau seluruh permintaan →</button>
          </fieldset>
          {draft && <section className="checkout-seller">
            <h2 ref={heading} tabIndex={-1}>Tinjau sebelum mengirim.</h2>
            {draft.map(row => <section className="checkout-brief" key={row.serviceId}>
              <h3>{services.find(item => item.id === row.serviceId)?.title}</h3>
              <dl><dt>Tanggal diminta</dt><dd>{row.input.requestedDate}</dd>
                <dt>Kebutuhan</dt><dd>{row.input.requirements}</dd>
                <dt>Deskripsi</dt><dd>{row.input.description}</dd>
                {row.input.location && <><dt>Lokasi proyek</dt><dd>{row.input.location}</dd></>}
              </dl>
            </section>)}
            <p>Semua layanan divalidasi kembali saat dikirim. Jika penyimpanan gagal, pesanan yang sudah tersimpan tetap dipertahankan. Tidak ada pembayaran otomatis.</p>
            <div className="checkout-row-actions">
              <button type="button" className="button button--secondary" onClick={() => setDraft(null)}>Ubah kebutuhan</button>
              <button type="button" className="button button--primary" disabled={!!storageError} onClick={confirm}>Konfirmasi {ids.length} permintaan</button>
            </div>
          </section>}
          {failure && <p role="alert" className="customer-warning">{failure}</p>}
        </form>
        <aside className="checkout-summary">
          <span className="market-kicker">RINGKASAN CHECKOUT</span><h2>Ruang untuk ide.</h2>
          <dl><div><dt>Pesanan terpisah</dt><dd>{ids.length}</dd></div>
            <div><dt>Estimasi subtotal</dt><dd>{money(checkoutTotal(ids, services))}</dd></div></dl>
          <p>Harga akhir ditetapkan masing-masing Seller saat menerima permintaan. Tidak ada biaya platform tambahan pada demo ini.</p>
        </aside>
      </div>}
    </CustomerFrame>
  );
}

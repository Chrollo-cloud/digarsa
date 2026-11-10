import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getCreator, money, services } from "../../data/marketplace";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import Input from "../../components/ui/Input";
import { localToday } from "./customerStore";
import { useCustomer } from "./useCustomer";
import { customerMessaging } from "../messaging/customerMessagingClient";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, cart, store } = useCustomer();
  const locked = useRef(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const selectedIds = params.getAll("service");
  const selectedKey = selectedIds.join("|");
  const invalidSelection = selectedIds.length === 0 ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some((id) => !cart.includes(id));
  const selected = useMemo(() => selectedKey
    .split("|")
    .filter(Boolean)
    .map((id) => services.find((service) => service.id === id))
    .filter(Boolean), [selectedKey]);
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const service of selected) {
      const creator = getCreator(service.creatorId);
      if (!grouped.has(service.creatorId)) grouped.set(service.creatorId, { creator, services: [] });
      grouped.get(service.creatorId).services.push(service);
    }
    return [...grouped.values()];
  }, [selected]);
  const total = selected.reduce((sum, service) => sum + service.price, 0);

  function review(event) {
    event.preventDefault();
    setError("");
    if (invalidSelection || selected.length !== selectedIds.length) {
      setError("Cart berubah atau layanan tidak tersedia. Kembali ke cart dan pilih ulang layanan.");
      return;
    }
    try {
      const form = new FormData(event.currentTarget);
      const entries = selected.map((service) => {
        const requestedDate = form.get(`date-${service.id}`) || "";
        const input = {
          requirements: form.get(`requirements-${service.id}`) || "",
          description: form.get(`description-${service.id}`) || "",
          requestedDate,
          location: form.get(`location-${service.id}`) || "",
          additionalInfo: form.get(`additional-${service.id}`) || "",
        };
        store.validateBooking(service.id, input);
        return { serviceId: service.id, input };
      });
      setDraft(entries);
    } catch (failure) {
      setError(failure.message || "Periksa kembali detail booking.");
    }
  }

  function submitBookings() {
    if (locked.current || !draft) return;
    locked.current = true;
    setError("");
    try {
      const bookings = store.createBookings(draft, {
        confirmed: true,
        expectedUserId: user.id,
      });
      let notificationWarning = false;
      for (const booking of bookings) {
        try {
          customerMessaging.notifyRequested(booking.id);
        } catch {
          notificationWarning = true;
        }
      }
      const next = new URLSearchParams();
      bookings.forEach((booking) => next.append("created", booking.id));
      navigate(`/orders?${next}`, { replace: true, state: { notificationWarning } });
    } catch (failure) {
      locked.current = false;
      setError(failure.message || "Booking belum dapat dikirim.");
    }
  }

  if (invalidSelection || !selected.length || selected.length !== selectedIds.length)
    return (
      <CustomerFrame title="Checkout belum siap.">
        <EmptyState title="Pilih ulang layanan dari Cart.">
          Checkout hanya menerima layanan yang dipilih dan masih ada di cart.
          <Link to="/cart">Kembali ke Cart ↗</Link>
        </EmptyState>
      </CustomerFrame>
    );

  return (
    <CustomerFrame title="Tinjau booking request." description="Kirim satu permintaan untuk setiap layanan terpilih. Setiap Seller akan mengonfirmasi secara terpisah; pembayaran belum dilakukan pada tahap ini.">
      <Link className="customer-back" to="/cart">← Kembali ke Cart</Link>
      {error && <p className="customer-warning" role="alert">{error}</p>}
      {!draft ? (
        <div className="customer-checkout-layout">
          <form className="customer-checkout-form" onSubmit={review}>
            {groups.map(({ creator, services: sellerServices }) => (
              <section className="customer-checkout-seller" key={creator?.id || sellerServices[0].creatorId}>
                <header><span className="market-kicker">SELLER</span><h2>{creator?.name || "Seller"}</h2></header>
                {sellerServices.map((service) => {
                  const onsite = service.delivery.toLowerCase() === "onsite";
                  const reason = store.getBookingRestriction(service.id);
                  return (
                    <fieldset className="customer-checkout-service" key={service.id}>
                      <legend>{service.title} · {money(service.price)}</legend>
                      {reason && <p className="customer-warning">{reason}</p>}
                      <label className="field">Kebutuhan proyek
                        <textarea className="field__control" name={`requirements-${service.id}`} required minLength={10} maxLength={2000} rows={3} placeholder="Hasil dan kebutuhan utama proyek…" />
                      </label>
                      <label className="field">Deskripsi kebutuhan
                        <textarea className="field__control" name={`description-${service.id}`} required minLength={20} maxLength={5000} rows={4} placeholder="Ceritakan konteks, tujuan, dan arah proyek…" />
                      </label>
                      <Input label={`Jadwal yang diinginkan${onsite || service.requiresSchedule ? "" : " (opsional)"}`} name={`date-${service.id}`} type="date" min={localToday()} required={onsite || service.requiresSchedule === true} />
                      {onsite && <Input label="Alamat / lokasi pengerjaan" name={`location-${service.id}`} required minLength={10} maxLength={500} placeholder="Alamat lokasi proyek" />}
                      <label className="field">Informasi tambahan (opsional)
                        <textarea className="field__control" name={`additional-${service.id}`} maxLength={2000} rows={2} placeholder="Referensi, preferensi, atau catatan lain…" />
                      </label>
                    </fieldset>
                  );
                })}
              </section>
            ))}
            <button className="button button--primary" type="submit">Tinjau permintaan ↗</button>
          </form>
          <aside className="customer-checkout-summary">
            <span className="market-kicker">RINGKASAN</span>
            <h2>{selected.length} booking · {groups.length} Seller</h2>
            {selected.map((service) => <p key={service.id}>{service.title}<strong>{money(service.price)}</strong></p>)}
            <hr />
            <p>Subtotal estimasi<strong>{money(total)}</strong></p>
            <p>Biaya tambahan<strong>{money(0)}</strong></p>
            <p className="customer-checkout-total">Total estimasi<strong>{money(total)}</strong></p>
            <small>Harga awal dapat dikonfirmasi Seller. Perubahan harga memerlukan persetujuan Buyer sebelum pembayaran.</small>
          </aside>
        </div>
      ) : (
        <section className="customer-confirmation customer-checkout-review">
          <span className="market-kicker">KONFIRMASI AKHIR</span>
          <h2>Setiap Seller menerima booking terpisah.</h2>
          {draft.map(({ serviceId, input }) => {
            const service = services.find((item) => item.id === serviceId);
            const creator = service && getCreator(service.creatorId);
            return <article key={serviceId}><h3>{service?.title}</h3><p>{creator?.name} · {money(service?.price || 0)}</p><dl><dt>Jadwal</dt><dd>{input.requestedDate || "Fleksibel"}</dd><dt>Kebutuhan</dt><dd>{input.requirements}</dd><dt>Deskripsi</dt><dd>{input.description}</dd>{input.location && <><dt>Lokasi</dt><dd>{input.location}</dd></>}{input.additionalInfo && <><dt>Informasi tambahan</dt><dd>{input.additionalInfo}</dd></>}</dl></article>;
          })}
          <p>Setelah dikirim, status setiap booking menjadi Requested dan payment status Unpaid. Pembayaran baru tersedia setelah Seller menerima booking.</p>
          <div className="customer-confirm-actions">
            <button className="button button--secondary" type="button" onClick={() => setDraft(null)}>Ubah detail</button>
            <button className="button button--primary" type="button" onClick={submitBookings}>Kirim {draft.length} booking request</button>
          </div>
        </section>
      )}
    </CustomerFrame>
  );
}

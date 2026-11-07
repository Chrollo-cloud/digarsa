import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { services, getCreator, money } from "../../data/marketplace";
import Input from "../../components/ui/Input";
import { bookingRestriction, localToday } from "./customerStore";
import CustomerFrame from "./CustomerFrame";
import EmptyState from "./EmptyState";
import BookingSummary from "./BookingSummary";
import { useCustomer } from "./useCustomer";

function BookingForm({ service, creator }) {
  const { user, store } = useCustomer();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const reviewHeading = useRef(null);
  const formHeading = useRef(null);
  const onsite = service.delivery.toLowerCase() === "onsite";
  function review(event) {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      store.validateBooking(service.id, values);
      setDraft(values);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  function confirm() {
    if (locked.current) return;
    locked.current = true;
    try {
      const booking = store.createBooking(service.id, draft, {
        confirmed: true,
        expectedUserId: user.id,
      });
      navigate(`/orders/${booking.id}?submitted=1`, { replace: true });
    } catch (failure) {
      locked.current = false;
      setError(failure.message);
    }
  }
  return (
    <div className="customer-booking-layout">
      <section className="customer-form-panel">
        <form onSubmit={review} hidden={!!draft}>
          <h2 tabIndex={-1} ref={formHeading}>
            Ceritakan rencanamu.
          </h2>
          <p>
            Lengkapi brief untuk membantu kreator memahami kebutuhan proyekmu.
          </p>
          <label className="field">
            Kebutuhan proyek
            <textarea
              className="field__control"
              name="requirements"
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              placeholder="Hasil, format, dan kebutuhan utama…"
            />
          </label>
          <label className="field">
            Deskripsi proyek
            <textarea
              className="field__control"
              name="description"
              required
              minLength={20}
              maxLength={5000}
              rows={5}
              placeholder="Ceritakan tujuan, konteks, dan arah kreatif…"
            />
          </label>
          <Input
            label={`Tanggal yang diminta${onsite || service.requiresSchedule ? "" : " (opsional)"}`}
            name="requestedDate"
            type="date"
            min={localToday()}
            required={onsite || service.requiresSchedule === true}
          />
          {onsite && (
            <Input
              label="Lokasi / alamat proyek"
              name="location"
              required
              minLength={10}
              maxLength={500}
            />
          )}
          <button type="submit" className="button button--primary">
            Tinjau permintaan →
          </button>
        </form>
        {draft && (
          <div className="customer-confirmation">
            <h2
              tabIndex={-1}
              ref={(node) => {
                reviewHeading.current = node;
                node?.focus();
              }}
            >
              Tinjau sebelum mengirim.
            </h2>
            <dl>
              <dt>Kebutuhan proyek</dt>
              <dd>{draft.requirements}</dd>
              <dt>Deskripsi</dt>
              <dd>{draft.description}</dd>
              <dt>Tanggal</dt>
              <dd>
                {draft.requestedDate || "Fleksibel, dibahas bersama kreator"}
              </dd>
              {onsite && (
                <>
                  <dt>Lokasi</dt>
                  <dd>{draft.location}</dd>
                </>
              )}
              <dt>Estimasi harga awal</dt>
              <dd>{money(service.price)}</dd>
            </dl>
            <p>
              Dengan konfirmasi ini kamu mengirim permintaan berstatus
              Requested. Kreator belum menerima proyek dan tidak ada biaya yang
              ditagihkan.
            </p>
            <div className="customer-confirm-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setDraft(null);
                  setError("");
                  window.requestAnimationFrame(() =>
                    formHeading.current?.focus(),
                  );
                }}
              >
                Ubah brief
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={confirm}
              >
                Konfirmasi dan kirim permintaan
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="customer-warning">
            {error}
          </p>
        )}
      </section>
      <BookingSummary service={service} creator={creator} />
    </div>
  );
}
export default function BookingRequestPage() {
  const { serviceId } = useParams();
  const { user } = useCustomer();
  const service = services.find((item) => item.id === serviceId);
  const creator = service && getCreator(service.creatorId);
  const reason = bookingRestriction(service, user, creator);
  return (
    <CustomerFrame
      title="Mulai dari brief yang jelas."
      description="Ajukan satu layanan, lalu tunggu tinjauan kreator."
    >
      <Link
        className="customer-back"
        to={service ? `/service/${service.id}` : "/marketplace"}
      >
        ← Kembali ke {service ? "layanan" : "marketplace"}
      </Link>
      {reason ? (
        <EmptyState title={reason}>
          Pilih layanan lain yang tersedia untuk memulai kolaborasi.
        </EmptyState>
      ) : (
        <BookingForm
          key={`${user.id}-${service.id}`}
          service={service}
          creator={creator}
        />
      )}
    </CustomerFrame>
  );
}

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

export default function SellerServicesPage() {
  const location = useLocation();
  const { services, servicesStatus, servicesError, catalog } = useSeller();
  const [confirming, setConfirming] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(location.state?.sellerSuccess || "");
  const [saving, setSaving] = useState(false);

  async function run(action, success) {
    setError("");
    setDone("");
    setSaving(true);
    try {
      await action();
      setConfirming("");
      setDone(success);
    } catch (failure) {
      setError(failure.message || "Perubahan tidak dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <SellerFrame
      title="Service saya."
      description="Published services appear in the marketplace and can be booked. Marking a service Fully booked prevents new bookings without removing it."
    >
      <div className="ws-toolbar">
        <Link className="button button--primary" to="/seller-dashboard/services/new">
          Add service +
        </Link>
        <p>{servicesStatus === "ready" ? `${services.length} services` : ""}</p>
      </div>
      {done && (
        <p className="ws-success" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="ws-alert" role="alert">
          {error}
        </p>
      )}
      {servicesStatus === "loading" && <p className="ws-notice" role="status">Memuat layanan…</p>}
      {servicesStatus === "error" && <p className="ws-alert" role="alert">{servicesError} <button type="button" className="location-link" onClick={() => void catalog.refresh().catch(() => {})}>Coba lagi</button></p>}
      {servicesStatus === "ready" && services.length === 0 ? (
        <Empty title="No services yet.">
          Add your first service so customers can find and book it.
        </Empty>
      ) : servicesStatus === "ready" ? (
        <ul className="ws-list">
          {services.map((service) => (
            <li key={service.id} className="ws-service">
              {service.image ? (
                <img src={service.image} alt="" loading="lazy" />
              ) : (
                <span className="ws-avatar" aria-hidden="true">
                  {service.title.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <h3>{service.title}</h3>
                <p>
                  {service.category} · {service.delivery} · {service.turnaround}
                </p>
                <div className="ws-service__meta">
                  <span className="ws-price">{money(service.price)}</span>
                  <StatusBadge status={service.active ? "live" : "hidden"}>
                    {service.active ? "Aktif" : "Nonaktif"}
                  </StatusBadge>
                  <StatusBadge
                    status={service.availability === "Open" ? "Open" : "Full-book"}
                  >
                    {service.availability === "Open" ? "Available" : "Fully booked"}
                  </StatusBadge>
                  {!service.active ? (
                    <StatusBadge status="hidden">Unpublished</StatusBadge>
                  ) : service.hidden ? (
                    <StatusBadge status="hidden">Disembunyikan admin</StatusBadge>
                  ) : (
                    <StatusBadge status="live">Published</StatusBadge>
                  )}
                </div>
                {service.hidden && (
                  <p>Alasan moderasi: {service.hiddenReason}</p>
                )}
              </div>
              <div className="ws-service__actions">
                <div className="ws-switch" role="group" aria-label={`Status services ${service.title}`}>
                  {[true, false].map((active) => (
                    <button
                      key={String(active)}
                      type="button"
                      aria-pressed={service.active === active}
                      disabled={saving}
                      onClick={() =>
                        service.active !== active &&
                        run(
                          () => catalog.setActive(service.id, active),
                          `Service ${active ? "diaktifkan" : "dinonaktifkan"}.`,
                        )
                      }
                    >
                      {active ? "Aktif" : "Nonaktif"}
                    </button>
                  ))}
                </div>
                <div className="ws-switch" role="group" aria-label={`Availability ${service.title}`}>
                  {[["Open", "Available"], ["Full-book", "Fully booked"]].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={service.availability === value}
                      disabled={saving}
                      onClick={() =>
                        service.availability !== value &&
                        run(
                          () => catalog.setAvailability(service.id, value),
                          `Availability diubah menjadi ${value}.`,
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <Link
                    className="ws-link"
                    to={`/seller-dashboard/services/${service.id}/availability`}
                  >
                    Jadwal
                  </Link>
                  <Link
                    className="ws-link"
                    to={`/seller-dashboard/services/${service.id}/edit`}
                  >
                    Ubah
                  </Link>
                  {service.active && !service.hidden && (
                    <Link className="ws-link" to={`/service/${service.id}`}>
                      Show
                    </Link>
                  )}
                  <button
                    type="button"
                    className="ws-link-button is-danger"
                        disabled={saving}
                        onClick={() => setConfirming(service.id)}
                  >
                    Hapus
                  </button>
                </div>
                {confirming === service.id && (
                  <div className="ws-inline-confirm" role="alertdialog" aria-label="Konfirmasi hapus">
                    <span>Hapus “{service.title}” secara permanen?</span>
                    <div className="ws-actions">
                      <button
                        type="button"
                        className="button button--danger"
                        disabled={saving}
                        onClick={() => void run(() => catalog.remove(service.id), "Service dihapus.")}
                      >
                        Ya, hapus
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setConfirming("")}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </SellerFrame>
  );
}

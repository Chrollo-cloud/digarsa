import { useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

export default function SellerServicesPage() {
  const { services, catalog } = useSeller();
  const [confirming, setConfirming] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function run(action, success) {
    setError("");
    setDone("");
    try {
      action();
      setConfirming("");
      setDone(success);
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <SellerFrame
      title="Layanan saya."
      description="Layanan yang tayang muncul di marketplace dan bisa dipesan pelanggan. Full-book menutup pemesanan baru tanpa menghapus layananmu."
    >
      <div className="ws-toolbar">
        <Link className="button button--primary" to="/seller-dashboard/services/new">
          Tambah layanan +
        </Link>
        <p>{services.length} layanan</p>
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
      {services.length === 0 ? (
        <Empty title="Belum ada layanan.">
          Tambahkan layanan pertamamu agar pelanggan bisa menemukan dan memesannya.
        </Empty>
      ) : (
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
                    {service.availability === "Open" ? "Open" : "Full-book"}
                  </StatusBadge>
                  {!service.active ? (
                    <StatusBadge status="hidden">Tidak tayang</StatusBadge>
                  ) : service.hidden ? (
                    <StatusBadge status="hidden">Disembunyikan admin</StatusBadge>
                  ) : (
                    <StatusBadge status="live">Tayang</StatusBadge>
                  )}
                </div>
                {service.hidden && (
                  <p>Alasan moderasi: {service.hiddenReason}</p>
                )}
              </div>
              <div className="ws-service__actions">
                <div className="ws-switch" role="group" aria-label={`Status layanan ${service.title}`}>
                  {[true, false].map((active) => (
                    <button
                      key={String(active)}
                      type="button"
                      aria-pressed={service.active === active}
                      onClick={() =>
                        service.active !== active &&
                        run(
                          () => catalog.setActive(service.id, active),
                          `Layanan ${active ? "diaktifkan" : "dinonaktifkan"}.`,
                        )
                      }
                    >
                      {active ? "Aktif" : "Nonaktif"}
                    </button>
                  ))}
                </div>
                <div className="ws-switch" role="group" aria-label={`Ketersediaan ${service.title}`}>
                  {["Open", "Full-book"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={service.availability === value}
                      onClick={() =>
                        service.availability !== value &&
                        run(
                          () => catalog.setAvailability(service.id, value),
                          `Ketersediaan diubah menjadi ${value}.`,
                        )
                      }
                    >
                      {value === "Open" ? "Open" : "Full-book"}
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
                      Lihat ↗
                    </Link>
                  )}
                  <button
                    type="button"
                    className="ws-link-button is-danger"
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
                        onClick={() =>
                          run(() => catalog.remove(service.id), "Layanan dihapus.")
                        }
                      >
                        Ya, hapus
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setConfirming("")}
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SellerFrame>
  );
}

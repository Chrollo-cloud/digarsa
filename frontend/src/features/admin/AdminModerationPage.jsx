import { useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminModerationPage() {
  const { services, catalog, creatorName, error: dataError } = useAdmin();
  const [hiding, setHiding] = useState("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const rows = services.filter((item) => {
    const matchesFilter = filter === "hidden"
      ? item.hidden || !item.active
      : filter === "live"
        ? !item.hidden && item.active
        : true;
    const query = search.trim().toLocaleLowerCase("en-US");
    return matchesFilter && [item.title, item.category, creatorName(item.creatorId), item.creatorId]
      .join(" ").toLocaleLowerCase("en-US").includes(query);
  });

  function run(action, success) {
    setError("");
    setDone("");
    try {
      action();
      setHiding("");
      setReason("");
      setDone(success);
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <AdminFrame
      title="Moderasi services."
      description="Service yang disembunyikan hilang of marketplace dan tidak bisa dipesan baru. Booking yang sudah ada tetap berjalan, dan seller melihat alasannya."
    >
      <div className="ws-toolbar">
        <div className="field">
          <label htmlFor="mod-search">Search services</label>
          <input id="mod-search" className="field__control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama services, kategori, seller" />
        </div>
        <div className="field">
          <label htmlFor="mod-filter">Tampilkan</label>
          <select id="mod-filter" className="field__control" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All services</option>
            <option value="live">Published</option>
            <option value="hidden">Unpublished / nonaktif</option>
          </select>
        </div>
        <p>{rows.length} services</p>
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
      {dataError ? (
        <Empty title="Sign up services belum tersedia.">Data could not be read. Check demo storage, then reload.</Empty>
      ) : rows.length === 0 ? (
        <Empty title="No services match this filter.">Adjust your filters to see more services.</Empty>
      ) : (
        <ul className="ws-list">
          {rows.map((service) => (
            <li key={service.id} className="ws-row">
              <div>
                <h3>{service.title}</h3>
                <p>
                  {creatorName(service.creatorId)} · {service.category} ·{" "}
                  {service.source === "seller" ? "Buatan seller" : "Katalog demo"} ·{" "}
                  {money(service.price)}
                </p>
                <details className="admin-service-details">
                  <summary>Details services</summary>
                  <dl>
                    <dt>ID services</dt><dd>{service.id}</dd>
                    <dt>Status publikasi</dt><dd>{service.hidden ? "Hidden by Admin" : service.active ? "Published" : "Inactive by Seller"}</dd>
                    <dt>Availability</dt><dd>{service.availability || "Tidak tersedia"}</dd>
                    <dt>Work mode</dt><dd>{service.delivery || "Tidak tercatat"}</dd>
                    <dt>Estimated turnaround</dt><dd>{service.turnaround || "Tidak tercatat"}</dd>
                    <dt>Description</dt><dd>{service.description || "Tidak tersedia"}</dd>
                    <dt>Workflow persetujuan</dt><dd>Tidak tersedia pada model moderasi demo.</dd>
                  </dl>
                </details>
                {service.hidden && (
                  <p>
                    Disembunyikan {dateOnly(service.hiddenAt)}: {service.hiddenReason}
                  </p>
                )}
                {hiding === service.id && (
                  <div className="ws-inline-confirm">
                    <label htmlFor={`reason-${service.id}`}>Alasan moderasi (dilihat seller)</label>
                    <textarea
                      id={`reason-${service.id}`}
                      className="field__control"
                      maxLength={300}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <div className="ws-actions">
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() =>
                          run(
                            () => catalog.moderate(service.id, { hidden: true, reason }),
                            "Service disembunyikan of marketplace.",
                          )
                        }
                      >
                        Hide services
                      </button>
                      <button type="button" className="button button--secondary" onClick={() => setHiding("")}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="ws-row__side">
                <StatusBadge status={service.hidden || !service.active ? "hidden" : "live"}>
                  {service.hidden ? "Disembunyikan admin" : service.active ? "Published" : "Inactive by Seller"}
                </StatusBadge>
                {service.hidden ? (
                  <button
                    type="button"
                    className="ws-link-button"
                    onClick={() =>
                      run(
                        () => catalog.moderate(service.id, { hidden: false }),
                        "Service dipulihkan ke marketplace.",
                      )
                    }
                  >
                    Pulihkan
                  </button>
                ) : service.active ? (
                  <>
                    <Link className="ws-link" to={`/service/${service.id}`}>
                      Show
                    </Link>
                    <button
                      type="button"
                      className="ws-link-button is-danger"
                      onClick={() => {
                        setError("");
                        setReason("");
                        setHiding(service.id);
                      }}
                    >
                      Hide
                    </button>
                  </>
                ) : (
                  <span className="ws-note">Seller menonaktifkan services ini.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminFrame>
  );
}

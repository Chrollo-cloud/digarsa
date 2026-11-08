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
    const query = search.trim().toLocaleLowerCase("id-ID");
    return matchesFilter && [item.title, item.category, creatorName(item.creatorId), item.creatorId]
      .join(" ").toLocaleLowerCase("id-ID").includes(query);
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
      title="Moderasi layanan."
      description="Layanan yang disembunyikan hilang dari marketplace dan tidak bisa dipesan baru. Booking yang sudah ada tetap berjalan, dan seller melihat alasannya."
    >
      <div className="ws-toolbar">
        <div className="field">
          <label htmlFor="mod-search">Cari layanan</label>
          <input id="mod-search" className="field__control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama layanan, kategori, seller" />
        </div>
        <div className="field">
          <label htmlFor="mod-filter">Tampilkan</label>
          <select id="mod-filter" className="field__control" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Semua layanan</option>
            <option value="live">Tayang</option>
            <option value="hidden">Tidak tayang / nonaktif</option>
          </select>
        </div>
        <p>{rows.length} layanan</p>
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
        <Empty title="Daftar layanan belum tersedia.">Data tidak dapat dibaca. Periksa penyimpanan demo, lalu muat ulang.</Empty>
      ) : rows.length === 0 ? (
        <Empty title="Tidak ada layanan untuk filter ini.">Ubah filter untuk melihat layanan lain.</Empty>
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
                  <summary>Detail layanan</summary>
                  <dl>
                    <dt>ID layanan</dt><dd>{service.id}</dd>
                    <dt>Status publikasi</dt><dd>{service.hidden ? "Disembunyikan Admin" : service.active ? "Tayang" : "Nonaktif oleh Seller"}</dd>
                    <dt>Ketersediaan</dt><dd>{service.availability || "Tidak tersedia"}</dd>
                    <dt>Mode pengerjaan</dt><dd>{service.delivery || "Tidak tercatat"}</dd>
                    <dt>Estimasi pengerjaan</dt><dd>{service.turnaround || "Tidak tercatat"}</dd>
                    <dt>Deskripsi</dt><dd>{service.description || "Tidak tersedia"}</dd>
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
                            "Layanan disembunyikan dari marketplace.",
                          )
                        }
                      >
                        Sembunyikan layanan
                      </button>
                      <button type="button" className="button button--secondary" onClick={() => setHiding("")}>
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="ws-row__side">
                <StatusBadge status={service.hidden || !service.active ? "hidden" : "live"}>
                  {service.hidden ? "Disembunyikan admin" : service.active ? "Tayang" : "Nonaktif seller"}
                </StatusBadge>
                {service.hidden ? (
                  <button
                    type="button"
                    className="ws-link-button"
                    onClick={() =>
                      run(
                        () => catalog.moderate(service.id, { hidden: false }),
                        "Layanan dipulihkan ke marketplace.",
                      )
                    }
                  >
                    Pulihkan
                  </button>
                ) : service.active ? (
                  <>
                    <Link className="ws-link" to={`/service/${service.id}`}>
                      Lihat ↗
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
                      Sembunyikan
                    </button>
                  </>
                ) : (
                  <span className="ws-note">Seller menonaktifkan layanan ini.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminFrame>
  );
}

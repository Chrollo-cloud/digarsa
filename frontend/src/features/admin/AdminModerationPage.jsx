import { useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminModerationPage() {
  const {
    services,
    catalog,
    creatorName,
    accounts,
    accountReports,
    store,
    error: dataError,
  } = useAdmin();

  const [hiding, setHiding] = useState("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const [suspending, setSuspending] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const rows = services.filter((item) => {
    const matchesFilter =
      filter === "hidden"
        ? item.hidden || !item.active
        : filter === "live"
          ? !item.hidden && item.active
          : true;

    const query = search.trim().toLocaleLowerCase("en-US");

    return (
      matchesFilter &&
      [item.title, item.category, creatorName(item.creatorId), item.creatorId]
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(query)
    );
  });

  const pendingReports = accountReports.filter(
    (report) => !report.status || report.status === "Pending",
  );

  function run(action, success) {
    setError("");
    setDone("");

    try {
      action();
      setHiding("");
      setReason("");
      setSuspending("");
      setSuspendReason("");
      setDone(success);
    } catch (failure) {
      setError(failure.message || "Tindakan gagal dilakukan.");
    }
  }

  return (
    <AdminFrame
      title="Moderasi services dan akun."
      description="Kelola laporan pengguna, status akun, dan publikasi services. Penangguhan akun tidak menghapus data maupun riwayat transaksi."
    >
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

      {/* LAPORAN AKUN */}
      <section className="admin-account-moderation">
        <div className="ws-section-head">
          <div>
            <h2>Laporan akun</h2>
            <p>
              Tinjau laporan pengguna sebelum mengambil tindakan moderasi.
            </p>
          </div>
          <StatusBadge status={pendingReports.length ? "warning" : "live"}>
            {pendingReports.length} laporan menunggu
          </StatusBadge>
        </div>

        {accountReports.length === 0 ? (
          <Empty title="Belum ada laporan akun.">
            Laporan dari pengguna akan muncul di bagian ini.
          </Empty>
        ) : (
          <ul className="ws-list">
            {accountReports.map((report) => {
              const target = accounts.find(
                (account) => account.id === report.targetAccountId,
              );

              const status = report.status || "Pending";

              return (
                <li key={report.id} className="ws-row">
                  <div className="admin-report-content">
                    <h3>{report.targetName || "Akun tidak tersedia"}</h3>

                    <p>
                      Dilaporkan oleh: {report.reporterName || "Akun tidak tersedia"}
                    </p>

                    <p>
                      Alasan: <strong>{report.reason}</strong>
                    </p>

                    <p>{report.details}</p>

                    <p className="ws-note">
                      ID laporan: {report.id}
                    </p>

                    <p className="ws-note">
                      Tanggal laporan: {dateOnly(report.submittedAt)}
                    </p>

                    {report.adminNote && (
                      <p className="ws-note">
                        Catatan admin: {report.adminNote}
                      </p>
                    )}

                    <div className="ws-actions">
                      {status === "Pending" && (
                        <>
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() =>
                              run(
                                () =>
                                  store.reviewAccountReport(
                                    report.id,
                                    "Reviewed",
                                    "Laporan telah ditinjau oleh administrator.",
                                  ),
                                "Laporan berhasil ditandai telah ditinjau.",
                              )
                            }
                          >
                            Tandai Ditinjau
                          </button>

                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() =>
                              run(
                                () =>
                                  store.reviewAccountReport(
                                    report.id,
                                    "Dismissed",
                                    "Laporan ditolak oleh administrator.",
                                  ),
                                "Laporan berhasil ditolak.",
                              )
                            }
                          >
                            Tolak Laporan
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="ws-row__side">
                    <StatusBadge
                      status={
                        status === "Pending"
                          ? "warning"
                          : status === "Dismissed"
                            ? "hidden"
                            : "live"
                      }
                    >
                      {status === "Pending"
                        ? "Menunggu"
                        : status === "Dismissed"
                          ? "Ditolak"
                          : "Ditinjau"}
                    </StatusBadge>

                    {target?.accountStatus === "Suspended" && (
                      <StatusBadge status="hidden">
                        Akun ditangguhkan
                      </StatusBadge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* STATUS DAN TINDAKAN AKUN */}
      <section className="admin-account-moderation">
        <div className="ws-section-head">
          <div>
            <h2>Manajemen status akun</h2>
            <p>
              Tangguhkan akun yang melanggar ketentuan atau aktifkan kembali
              akun yang telah ditinjau.
            </p>
          </div>
        </div>

        {accounts.filter((account) => !account.isAdmin).length === 0 ? (
          <Empty title="Belum ada akun pengguna.">
            Data akun pengguna akan muncul di bagian ini.
          </Empty>
        ) : (
          <ul className="ws-list">
            {accounts
              .filter((account) => !account.isAdmin)
              .map((account) => (
                <li key={account.id} className="ws-row">
                  <div>
                    <h3>{account.name}</h3>
                    <p>{account.email}</p>
                    <p className="ws-note">
                      {account.isSeller ? "Buyer dan Seller" : "Buyer"}
                      {" · "}
                      Bergabung: {dateOnly(account.createdAt)}
                    </p>

                    {account.accountStatus === "Suspended" && (
                      <p className="ws-note">
                        Alasan penangguhan: {account.suspendedReason || "Tidak tercatat"}
                      </p>
                    )}

                    {suspending === account.id && (
                      <div className="ws-inline-confirm">
                        <label htmlFor={`suspend-reason-${account.id}`}>
                          Alasan penangguhan akun
                        </label>

                        <textarea
                          id={`suspend-reason-${account.id}`}
                          className="field__control"
                          value={suspendReason}
                          onChange={(event) =>
                            setSuspendReason(event.target.value)
                          }
                          minLength={5}
                          maxLength={300}
                          placeholder="Jelaskan alasan penangguhan (5–300 karakter)."
                        />

                        <div className="ws-actions">
                          <button
                            type="button"
                            className="button button--danger"
                            onClick={() =>
                              run(
                                () =>
                                  store.suspendAccount(
                                    account.id,
                                    suspendReason,
                                  ),
                                `Akun ${account.name} berhasil ditangguhkan. Data dan riwayat transaksi tetap dipertahankan.`,
                              )
                            }
                          >
                            Konfirmasi Suspend
                          </button>

                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => {
                              setSuspending("");
                              setSuspendReason("");
                            }}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="ws-row__side">
                    <StatusBadge
                      status={
                        account.accountStatus === "Suspended"
                          ? "hidden"
                          : "live"
                      }
                    >
                      {account.accountStatus === "Suspended"
                        ? "Suspended"
                        : "Active"}
                    </StatusBadge>

                    {account.accountStatus === "Suspended" ? (
                      <button
                        type="button"
                        className="ws-link-button"
                        onClick={() =>
                          run(
                            () => store.reinstateAccount(account.id),
                            `Akun ${account.name} berhasil diaktifkan kembali.`,
                          )
                        }
                      >
                        Aktifkan Kembali
                      </button>
                    ) : suspending !== account.id ? (
                      <button
                        type="button"
                        className="ws-link-button is-danger"
                        onClick={() => {
                          setError("");
                          setDone("");
                          setSuspendReason("");
                          setSuspending(account.id);
                        }}
                      >
                        Suspend Akun
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* MODERASI SERVICES YANG SUDAH ADA */}
      <section className="admin-account-moderation">
        <div className="ws-section-head">
          <div>
            <h2>Moderasi services</h2>
            <p>
              Service yang disembunyikan hilang dari marketplace dan tidak bisa
              dipesan baru. Booking yang sudah ada tetap berjalan, dan seller
              melihat alasannya.
            </p>
          </div>
        </div>

        <div className="ws-toolbar">
          <div className="field">
            <label htmlFor="mod-search">Search services</label>
            <input
              id="mod-search"
              className="field__control"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nama services, kategori, seller"
            />
          </div>

          <div className="field">
            <label htmlFor="mod-filter">Tampilkan</label>
            <select
              id="mod-filter"
              className="field__control"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All services</option>
              <option value="live">Published</option>
              <option value="hidden">Unpublished / nonaktif</option>
            </select>
          </div>

          <p>{rows.length} services</p>
        </div>

        {dataError ? (
          <Empty title="Data moderasi belum tersedia.">
            {dataError}
          </Empty>
        ) : rows.length === 0 ? (
          <Empty title="No services match this filter.">
            Adjust your filters to see more services.
          </Empty>
        ) : (
          <ul className="ws-list">
            {rows.map((service) => (
              <li key={service.id} className="ws-row">
                <div>
                  <h3>{service.title}</h3>
                  <p>
                    {creatorName(service.creatorId)} · {service.category} ·{" "}
                    {service.source === "seller"
                      ? "Buatan seller"
                      : "Katalog demo"}{" "}
                    · {money(service.price)}
                  </p>

                  <details className="admin-service-details">
                    <summary>Details services</summary>
                    <dl>
                      <dt>ID services</dt>
                      <dd>{service.id}</dd>
                      <dt>Status publikasi</dt>
                      <dd>
                        {service.hidden
                          ? "Hidden by Admin"
                          : service.active
                            ? "Published"
                            : "Inactive by Seller"}
                      </dd>
                      <dt>Availability</dt>
                      <dd>{service.availability || "Tidak tersedia"}</dd>
                      <dt>Work mode</dt>
                      <dd>{service.delivery || "Tidak tercatat"}</dd>
                      <dt>Estimated turnaround</dt>
                      <dd>{service.turnaround || "Tidak tercatat"}</dd>
                      <dt>Description</dt>
                      <dd>{service.description || "Tidak tersedia"}</dd>
                      <dt>Workflow persetujuan</dt>
                      <dd>
                        Tidak tersedia pada model moderasi demo.
                      </dd>
                    </dl>
                  </details>

                  {service.hidden && (
                    <p>
                      Disembunyikan {dateOnly(service.hiddenAt)}:{" "}
                      {service.hiddenReason}
                    </p>
                  )}

                  {hiding === service.id && (
                    <div className="ws-inline-confirm">
                      <label htmlFor={`reason-${service.id}`}>
                        Alasan moderasi (dilihat seller)
                      </label>

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
                              () =>
                                catalog.moderate(service.id, {
                                  hidden: true,
                                  reason,
                                }),
                              "Service berhasil disembunyikan dari marketplace.",
                            )
                          }
                        >
                          Hide services
                        </button>

                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => setHiding("")}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="ws-row__side">
                  <StatusBadge
                    status={
                      service.hidden || !service.active ? "hidden" : "live"
                    }
                  >
                    {service.hidden
                      ? "Disembunyikan admin"
                      : service.active
                        ? "Published"
                        : "Inactive by Seller"}
                  </StatusBadge>

                  {service.hidden ? (
                    <button
                      type="button"
                      className="ws-link-button"
                      onClick={() =>
                        run(
                          () =>
                            catalog.moderate(service.id, { hidden: false }),
                          "Service berhasil dipulihkan ke marketplace.",
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
                    <span className="ws-note">
                      Seller menonaktifkan services ini.
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminFrame>
  );
}
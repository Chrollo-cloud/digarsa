import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";
import { useAuth } from "../account/authContext";

export default function AdminAccountsPage() {
  const { accounts, error } = useAdmin();
  const { store } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [reportError, setReportError] = useState("");
  const role = searchParams.get("role") || "all";
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return accounts.filter((account) => {
      const matchesRole =
        role === "customer" ? account.isCustomer :
        role === "seller" ? account.isSeller :
        role === "admin" ? account.isAdmin : true;
      const text = [account.name, account.email, account.sellerName, account.sellerProfileId]
        .join(" ").toLocaleLowerCase("id-ID");
      return matchesRole && text.includes(query);
    });
  }, [accounts, role, search]);

  let reports = [];
  let reportLoadError = "";
  try {
    reports = store.listAccountReportsForAdmin();
  } catch (failure) {
    reportLoadError = failure.message;
  }

  function changeRole(value) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("role");
    else next.set("role", value);
    setSearchParams(next, { replace: true });
  }

  function reviewReport(id, action) {
    const prompt = action === "suspend"
      ? "Nonaktifkan akun ini? Pengguna tidak dapat masuk dan Seller Profile tidak lagi dapat dipesan. Riwayat tetap disimpan."
      : "Tandai laporan ini tidak terbukti dan tutup laporan?";
    if (!window.confirm(prompt)) return;
    try {
      store.reviewAccountReport(id, action);
      setReportError("");
    } catch (failure) {
      setReportError(failure.message);
    }
  }

  const openReports = reports.filter((row) => row.status === "open").length;

  return (
    <AdminFrame
      title="Manajemen akun."
      description="Kelola akun Customer dan Seller, sekaligus tinjau laporan akun dalam satu halaman. Informasi kredensial tidak tersedia di tampilan Admin."
    >
      <div className="ws-toolbar admin-toolbar">
        <div className="field">
          <label htmlFor="admin-account-search">Cari akun</label>
          <input id="admin-account-search" className="field__control" type="search"
            placeholder="Nama, email, atau Seller Profile" value={search}
            onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="admin-account-role">Peran akun</label>
          <select id="admin-account-role" className="field__control" value={role}
            onChange={(event) => changeRole(event.target.value)}>
            <option value="all">Semua akun</option>
            <option value="customer">Customer-capable</option>
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p>{rows.length} dari {accounts.length} akun</p>
      </div>
      <p className="ws-notice admin-capability-note">
        Akun Digarsa dapat berperan sebagai Customer; Seller adalah kemampuan tambahan melalui Seller Profile. Penonaktifan akun mempertahankan riwayat transaksi dan laporan.
      </p>
      {error ? (
        <Empty title="Daftar akun belum tersedia.">Data akun tidak dapat dibaca. Periksa penyimpanan demo, lalu muat ulang.</Empty>
      ) : rows.length === 0 ? (
        <Empty title={accounts.length ? "Akun tidak ditemukan." : "Belum ada akun."}>
          {accounts.length ? "Ubah kata pencarian atau filter peran." : "Akun akan muncul setelah pengguna mendaftar."}
        </Empty>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table admin-account-table">
            <thead><tr><th scope="col">Akun</th><th scope="col">Peran</th><th scope="col">Seller Profile</th><th scope="col">Status akun</th></tr></thead>
            <tbody>{rows.map((account) => (
              <tr key={account.id}>
                <td>
                  <strong>{account.name}</strong>{account.isSelf && <small>Akun Admin aktif</small>}
                  <small>{account.email}</small>
                  <details className="admin-account-details">
                    <summary>Lihat detail akun</summary>
                    <dl>
                      <dt>ID akun</dt><dd>{account.id}</dd>
                      <dt>Tanggal dibuat</dt><dd>{account.createdAt ? dateTime(account.createdAt) : "Tidak tercatat"}</dd>
                      {account.isSeller && <><dt>ID Seller Profile</dt><dd>{account.sellerProfileId}</dd><dt>Kategori / kota</dt><dd>{account.sellerCategory || "—"} · {account.sellerCity || "—"}</dd></>}
                    </dl>
                  </details>
                </td>
                <td>
                  {account.isCustomer && <StatusBadge status="open">Customer</StatusBadge>} {" "}
                  {account.isSeller && <StatusBadge status="accepted">Seller</StatusBadge>} {" "}
                  {account.isAdmin && <StatusBadge status="requested">Admin</StatusBadge>}
                </td>
                <td>{account.isSeller ? <><strong>{account.sellerName}</strong><small>Profil Seller</small></> : "—"}</td>
                <td>{account.status === "suspended" ? <><StatusBadge status="declined">Dinonaktifkan</StatusBadge><small>Akses masuk diblokir</small></> : <StatusBadge status="open">Aktif</StatusBadge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <section className="admin-reports-section" aria-labelledby="admin-reports-title">
        <div className="admin-reports-heading">
          <div>
            <span className="ws-kicker">PENINJAUAN</span>
            <h2 id="admin-reports-title">Laporan akun</h2>
            <p>Laporan dari Customer maupun Seller yang perlu diperiksa Admin.</p>
          </div>
          <StatusBadge status={openReports ? "requested" : "accepted"}>{openReports} menunggu</StatusBadge>
        </div>
        <p className="ws-notice">Utamakan penonaktifan akun daripada penghapusan permanen. Akun yang dinonaktifkan tidak dapat masuk dan Seller Profile tidak dapat dipesan, tetapi jejak laporan serta transaksi tetap disimpan.</p>
        {(reportError || reportLoadError) && <p className="ws-alert" role="alert">{reportError || reportLoadError}</p>}
        {!reports.length ? (
          <Empty title="Belum ada laporan akun.">Laporan akun yang dikirim Customer atau Seller akan muncul di bagian ini.</Empty>
        ) : (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead><tr><th>Pelapor</th><th>Akun dilaporkan</th><th>Alasan & detail</th><th>Tanggal</th><th>Status</th><th>Tindakan</th></tr></thead>
              <tbody>{reports.map((row) => (
                <tr key={row.id}>
                  <td>{row.reporter}</td>
                  <td><strong>{row.target}</strong><small>{row.targetEmail}</small><small>Status akun: {row.targetStatus === "suspended" ? "Nonaktif" : "Aktif"}</small></td>
                  <td><strong>{row.reason}</strong><small className="admin-report-detail">{row.details}</small></td>
                  <td>{dateTime(row.createdAt)}</td>
                  <td><StatusBadge status={row.status === "open" ? "requested" : "accepted"}>{row.status === "open" ? "Menunggu" : row.action === "suspend" ? "Akun dinonaktifkan" : "Ditolak"}</StatusBadge></td>
                  <td>{row.status === "open" ? <div className="admin-report-actions"><button type="button" onClick={() => reviewReport(row.id, "dismiss")}>Tolak laporan</button><button type="button" className="is-danger" onClick={() => reviewReport(row.id, "suspend")}>Nonaktifkan akun</button></div> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </AdminFrame>
  );
}
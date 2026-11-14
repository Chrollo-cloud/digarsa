import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import { dateTime } from "../workspace/format";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminAccountsPage() {
  const { accounts, error } = useAdmin();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const role = searchParams.get("role") || "all";
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-US");
    return accounts.filter((account) => {
      const matchesRole =
        role === "customer"
          ? account.isCustomer
          : role === "seller"
            ? account.isSeller
            : role === "admin"
              ? account.isAdmin
              : true;
      const text = [account.name, account.email, account.sellerName, account.sellerProfileId]
        .join(" ")
        .toLocaleLowerCase("en-US");
      return matchesRole && text.includes(query);
    });
  }, [accounts, role, search]);

  function changeRole(value) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("role");
    else next.set("role", value);
    setSearchParams(next, { replace: true });
  }

  return (
    <AdminFrame
      title="Manajemen akun."
      description="Search dan tinjau akun Customer serta Seller of model akun terpadu. Informasi kredensial tidak tersedia di tampilan Admin."
    >
      <div className="ws-toolbar admin-toolbar">
        <div className="field">
          <label htmlFor="admin-account-search">Search akun</label>
          <input
            id="admin-account-search"
            className="field__control"
            type="search"
            placeholder="Nama, email, atau Seller Profile"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-account-role">Peran akun</label>
          <select id="admin-account-role" className="field__control" value={role} onChange={(event) => changeRole(event.target.value)}>
            <option value="all">All akun</option>
            <option value="customer">Customer-capable</option>
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p>{rows.length} of {accounts.length} akun</p>
      </div>
      <p className="ws-notice admin-capability-note">
        Akun Digarsa dapat berperan sebagai Customer; Seller adalah kemampuan tambahan melalui Seller Profile. Model demo belum memiliki status suspend akun atau status verifikasi Seller.
      </p>
      {error ? (
        <Empty title="Sign up akun belum tersedia.">Data akun tidak dapat dibaca. Periksa penyimpanan demo, lalu muat ulang.</Empty>
      ) : rows.length === 0 ? (
        <Empty title={accounts.length ? "Akun tidak ditemukan." : "Belum ada akun."}>
          {accounts.length ? "Ubah kata pencarian atau filter peran." : "Akun akan muncul setelah pengguna mendaftar."}
        </Empty>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table admin-account-table">
            <thead>
              <tr>
                <th scope="col">Akun</th>
                <th scope="col">Peran</th>
                <th scope="col">Seller Profile</th>
                <th scope="col">Status data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => (
                <tr key={account.id}>
                  <td>
                    <strong>{account.name}</strong>{account.isSelf && <small>Akun Admin aktif</small>}
                    <small>{account.email}</small>
                    <details className="admin-account-details">
                      <summary>View details akun</summary>
                      <dl>
                        <dt>ID akun</dt><dd>{account.id}</dd>
                        <dt>Tanggal dibuat</dt><dd>{account.createdAt ? dateTime(account.createdAt) : "Tidak tercatat"}</dd>
                        {account.isSeller && <>
                          <dt>ID Seller Profile</dt><dd>{account.sellerProfileId}</dd>
                          <dt>Kategori / kota</dt><dd>{account.sellerCategory || "—"} · {account.sellerCity || "—"}</dd>
                        </>}
                      </dl>
                    </details>
                  </td>
                  <td>
                    {account.isCustomer && <StatusBadge status="open">Customer</StatusBadge>} {" "}
                    {account.isSeller && <StatusBadge status="accepted">Seller</StatusBadge>} {" "}
                    {account.isAdmin && <StatusBadge status="requested">Admin</StatusBadge>}
                  </td>
                  <td>{account.isSeller ? <><strong>{account.sellerName}</strong><small>Profil aktif · verifikasi tidak tersedia di model demo</small></> : "—"}</td>
                  <td><StatusBadge status="open">Terdaftar</StatusBadge><small>Kontrol aktivasi tidak tersedia</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminFrame>
  );
}

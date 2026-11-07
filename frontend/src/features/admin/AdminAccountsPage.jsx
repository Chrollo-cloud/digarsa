import { Empty, StatusBadge } from "../workspace/WorkspaceFrame";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminAccountsPage() {
  const { accounts } = useAdmin();
  return (
    <AdminFrame
      title="Akun."
      description="Daftar akun terpadu Phase 5. Peran seller berasal dari Seller Profile yang dimiliki, sedangkan izin admin dibaca terpisah dan tidak bisa diberikan dari halaman ini."
    >
      {accounts.length === 0 ? (
        <Empty title="Belum ada akun.">Akun muncul setelah ada yang mendaftar.</Empty>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Email</th>
                <th scope="col">Peran</th>
                <th scope="col">Seller Profile</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.name}
                    {account.isSelf && <small>Kamu</small>}
                  </td>
                  <td>{account.email}</td>
                  <td>
                    <StatusBadge status="open">Buyer</StatusBadge>{" "}
                    {account.isSeller && <StatusBadge status="accepted">Seller</StatusBadge>}{" "}
                    {account.isAdmin && <StatusBadge status="requested">Admin</StatusBadge>}
                  </td>
                  <td>{account.sellerName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminFrame>
  );
}

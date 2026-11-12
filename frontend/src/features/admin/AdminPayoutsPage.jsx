import { useState } from "react";
import { money } from "../../data/marketplace";
import { payoutStore, PAYOUT_STATUSES } from "../seller/payoutStore";
import { Empty } from "../workspace/WorkspaceFrame";
import AdminFrame from "./AdminFrame";
import { useAdmin } from "./useAdmin";

export default function AdminPayoutsPage() {
  const { accounts } = useAdmin();
  const [, setRevision] = useState(0); const [status, setStatus] = useState(""); const [query, setQuery] = useState(""); const [error, setError] = useState("");
  const rows = payoutStore.adminList();
  const names = Object.fromEntries(accounts.map(row => [row.sellerProfileId, row.sellerName || row.name]));
  const filtered = rows.filter(row => (!status || row.status === status) && `${names[row.sellerId] || row.sellerId} ${row.id}`.toLowerCase().includes(query.toLowerCase()));
  function change(id, next) { try { payoutStore.updateStatus(id, next); setError(""); setRevision(value => value + 1); } catch (failure) { setError(failure.message); } }
  return <AdminFrame title="Payout monitoring." description="Manage demo payout request statuses. No bank transfers are made.">
    {error && <p className="ws-alert" role="alert">{error}</p>}
    <div className="ws-toolbar"><label className="field">Search sellers<input className="field__control" type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="field">Status<select className="field__control" value={status} onChange={e => setStatus(e.target.value)}><option value="">All status</option>{PAYOUT_STATUSES.map(item => <option key={item}>{item}</option>)}</select></label></div>
    {!filtered.length ? <Empty title="No matching payouts.">Seller withdrawal requests will appear here.</Empty> : <div className="ws-table-wrap"><table className="ws-table admin-payout-table"><thead><tr><th>ID payout</th><th>Seller</th><th>Nominal</th><th>Demo bank account</th><th>Requested</th><th>Status and history</th><th>Demo actions</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td>{row.id}</td><td>{names[row.sellerId] || row.sellerId}</td><td>{money(row.amount)}</td><td>{row.account.bankName}<br />{row.account.accountName} · {row.account.accountNumber}</td><td>{new Date(row.requestedAt).toLocaleString("en-US")}</td><td>{row.status}<details><summary>Riwayat status</summary><ol>{row.history.map((event,index)=><li key={`${row.id}-${index}`}>{event.status} · {new Date(event.at).toLocaleString("en-US")}</li>)}</ol></details></td><td>{row.status === "Requested" && <><button className="button button--secondary" onClick={() => change(row.id,"Processing")}>Process</button><button className="button button--secondary" onClick={() => change(row.id,"Failed")}>Mark as failed</button><button className="button button--secondary" onClick={() => change(row.id,"Cancelled")}>Cancel</button></>}{row.status === "Processing" && <><button className="button button--primary" onClick={() => change(row.id,"Paid Out")}>Mark as Paid Out</button><button className="button button--secondary" onClick={() => change(row.id,"Failed")}>Mark as failed</button><button className="button button--secondary" onClick={() => change(row.id,"Cancelled")}>Cancel</button></>}{row.status === "Failed" && <button className="button button--secondary" onClick={() => change(row.id,"Processing")}>Process ulang</button>}</td></tr>)}</tbody></table></div>}
  </AdminFrame>;
}

import { useState } from "react";
import { money } from "../../data/marketplace";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { payoutStore, PAYOUT_STATUSES } from "./payoutStore";
import { Empty } from "../workspace/WorkspaceFrame";

export default function PayoutHistoryPage() {
  const { profile } = useSeller(); const sellerId = profile?.id;
  const [filter, setFilter] = useState("");
  const rows = sellerId ? payoutStore.list(sellerId).filter(row => !filter || row.status === filter) : [];
  return <SellerFrame title="Payout history." description="Permintaan dan status payout demo.">
    <label className="field">Filter by status<select className="field__control" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All status</option>{PAYOUT_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
    {!rows.length ? <Empty title="Belum ada pencairan.">Permintaan withdraw akan tampil di sini.</Empty> : <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>ID payout</th><th>Requested</th><th>Nominal</th><th>Destination account</th><th>Status</th><th>Details</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.id}</td><td>{new Date(row.requestedAt).toLocaleString("en-US")}</td><td>{money(row.amount)}</td><td>{row.account.bankName} · {row.account.accountNumber}</td><td>{row.status}</td><td><details><summary>Riwayat</summary><ol>{row.history.map((event,index) => <li key={`${row.id}-${index}`}>{event.status} · {new Date(event.at).toLocaleString("en-US")}</li>)}</ol></details></td></tr>)}</tbody></table></div>}
  </SellerFrame>;
}

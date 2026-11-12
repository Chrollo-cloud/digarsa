import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import { payoutStore } from "./payoutStore";
import { getAvailableBalance } from "./earnings";

export default function WithdrawPage() {
  const { profile, bookings } = useSeller();
  const sellerId = profile?.id;
  const [accounts, setAccounts] = useState(() => sellerId ? payoutStore.listAccounts(sellerId) : []);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const available = getAvailableBalance(bookings, sellerId ? payoutStore.list(sellerId) : []);
  function addAccount(event) {
    event.preventDefault();
    try {
      const saved = payoutStore.addAccount(sellerId, { bankName, accountName, accountNumber });
      setAccounts(payoutStore.listAccounts(sellerId)); setAccountId(saved.id); setError(""); setMessage("Demo bank account berhasil disimpan.");
      setBankName(""); setAccountName(""); setAccountNumber("");
    } catch (failure) { setError(failure.message); }
  }
  function withdraw(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    try {
      const payout = payoutStore.request({ sellerId, accountId, amount: Number(amount), bookings });
      setError(""); setMessage(`Permintaan ${payout.id} tersimpan sebagai demo.`); setAmount("");
    } catch (failure) { setError(failure.message); }
    finally { locked.current = false; }
  }
  return <SellerFrame title="Withdraw." description="Demo payout request. No real bank transfer will be made.">
    <section className="ws-section"><h2>Available balance: {money(available)}</h2>
      <form className="ws-form" onSubmit={withdraw}>
        <label className="field">Demo bank account<select className="field__control" value={accountId} onChange={e => setAccountId(e.target.value)} required><option value="">Select an account</option>{accounts.map(row => <option key={row.id} value={row.id}>{row.bankName} · {row.accountNumber}</option>)}</select></label>
        <label className="field">Amount (IDR)<input className="field__control" type="number" min="1" step="1" max={available} value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        <button className="button button--primary" type="submit" disabled={!sellerId}>Request demo payout</button>
      </form>
    </section>
    <section className="ws-section"><h2>Tambah rekening demo.</h2>
      <form className="ws-form" onSubmit={addAccount}>
        <label className="field">Bank name<input className="field__control" value={bankName} onChange={e => setBankName(e.target.value)} required maxLength="80" /></label>
        <label className="field">Account holder<input className="field__control" value={accountName} onChange={e => setAccountName(e.target.value)} required maxLength="100" /></label>
        <label className="field">Demo account number<input className="field__control" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required maxLength="40" /></label>
        <button className="button button--secondary" type="submit" disabled={!sellerId}>Save rekening demo</button>
      </form>
    </section>
    {error && <p className="ws-alert" role="alert">{error}</p>}{message && <p className="customer-success" role="status">{message} <Link to="/seller-dashboard/payout-history">Show riwayat</Link></p>}
  </SellerFrame>;
}

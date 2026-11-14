import { getAvailableBalance } from "./earnings.js";

export const PAYOUT_KEY = "digarsa.demo.payouts.v1";
export const PAYOUT_STATUSES = ["Requested", "Processing", "Paid Out", "Failed", "Cancelled"];
const empty = () => ({ version: 1, accounts: [], payouts: [] });
const id = () => globalThis.crypto.randomUUID();

export function createPayoutStore(storage = globalThis.window?.localStorage, now = () => new Date().toISOString()) {
  let revision = 0;
  const listeners = new Set();
  const notify = () => { revision += 1; listeners.forEach(listener => listener()); };
  const read = () => {
    try {
      const value = storage?.getItem(PAYOUT_KEY);
      if (!value) return empty();
      const parsed = JSON.parse(value);
      if (parsed.version !== 1 || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.payouts)) return empty();
      return parsed;
    } catch { return empty(); }
  };
  const write = data => {
    if (!storage?.setItem) throw new Error("Penyimpanan payout demo tidak tersedia.");
    storage.setItem(PAYOUT_KEY, JSON.stringify(data));
    notify();
  };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot() { return revision; },
    refresh() { notify(); },
    listAccounts(sellerId) { return read().accounts.filter(row => row.sellerId === sellerId); },
    addAccount(sellerId, { bankName, accountName, accountNumber }) {
      if (![sellerId, bankName, accountName, accountNumber].every(value => typeof value === "string" && value.trim())) throw new Error("Lengkapi informasi rekening demo.");
      const data = read();
      const account = { id: `bank-${id()}`, sellerId, bankName: bankName.trim(), accountName: accountName.trim(), accountNumber: accountNumber.trim(), createdAt: now() };
      data.accounts.push(account); write(data); return account;
    },
    list(sellerId) { return read().payouts.filter(row => row.sellerId === sellerId).sort((a,b) => b.requestedAt.localeCompare(a.requestedAt)); },
    adminList() { return read().payouts.sort((a,b) => b.requestedAt.localeCompare(a.requestedAt)); },
    request({ sellerId, accountId, amount, bookings }) {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Nominal pencairan harus berupa rupiah positif.");
      const data = read();
      const account = data.accounts.find(row => row.id === accountId && row.sellerId === sellerId);
      if (!account) throw new Error("Select an account demo milik akun Seller ini.");
      const available = getAvailableBalance(bookings, data.payouts.filter(row => row.sellerId === sellerId));
      if (amount > available) throw new Error("Nominal melebihi saldo tersedia.");
      const payout = { id: `PO-${id()}`, sellerId, accountId, account: { bankName: account.bankName, accountName: account.accountName, accountNumber: account.accountNumber }, amount, status: "Requested", requestedAt: now(), history: [{ status: "Requested", at: now() }] };
      data.payouts.push(payout); write(data); return payout;
    },
    updateStatus(payoutId, status) {
      if (!PAYOUT_STATUSES.includes(status)) throw new Error("Status payout tidak dikenal.");
      const data = read(); const payout = data.payouts.find(row => row.id === payoutId);
      if (!payout) throw new Error("Payout tidak ditemukan.");
      const transitions = { Requested: ["Processing", "Failed", "Cancelled"], Processing: ["Paid Out", "Failed", "Cancelled"], Failed: ["Processing", "Cancelled"], "Paid Out": [], Cancelled: [] };
      if (!transitions[payout.status]?.includes(status)) throw new Error("Perubahan status payout tidak diizinkan.");
      payout.status = status; payout.history.push({ status, at: now() }); write(data); return payout;
    },
  };
}

export const payoutStore = createPayoutStore();

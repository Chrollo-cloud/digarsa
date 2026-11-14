import { paymentStatusOf } from "../customer/paymentStatus.js";

const validAmount = (amount) => Number.isSafeInteger(amount) && amount >= 0;
const uniquePaid = (bookings) => [...new Map(bookings.filter(row => paymentStatusOf(row) === "Paid" && validAmount(row.finalPrice)).map(row => [row.demoPayment?.id || row.id, row])).values()];
const total = rows => rows.reduce((sum, row) => sum + row.finalPrice, 0);
export const getGrossEarnings = bookings => total(uniquePaid(bookings));
const grossValue = value => Array.isArray(value) ? getGrossEarnings(value) : Number.isSafeInteger(value) && value > 0 ? value : 0;
export const getDigarsaCommission = amountOrRows => Math.round(grossValue(amountOrRows) * 0.05);
export const getSellerNetEarnings = amountOrRows => {
  const gross = grossValue(amountOrRows);
  return Math.max(0, gross - getDigarsaCommission(gross));
};
export const getPendingBalance = (bookings) => getSellerNetEarnings(uniquePaid(bookings).filter(row => row.status !== "Completed"));
export const getTotalPayout = payouts => payouts.filter(row => row.status === "Paid Out").reduce((sum, row) => sum + row.amount, 0);
export function getAvailableBalance(bookings, payouts = []) {
  const completedNet = getSellerNetEarnings(uniquePaid(bookings).filter(row => row.status === "Completed"));
  const reserved = payouts.filter(row => ["Requested", "Processing", "Paid Out"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0);
  return Math.max(0, completedNet - reserved);
}
export function getEarningsHistory(bookings) {
  return uniquePaid(bookings).map(row => ({ ...row, gross: row.finalPrice, commission: getDigarsaCommission(row.finalPrice), net: getSellerNetEarnings(row.finalPrice), paidAt: row.demoPayment?.paidAt || row.updatedAt || row.createdAt || "" })).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function monthKey(iso) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "unknown";
}
export function summarizeEarnings(bookings) {
  const by = (...statuses) =>
    bookings.filter((booking) => statuses.includes(booking.status));

  const completed = by("Completed");
  const progress = by("Accepted", "Paid");
  const pending = by("Requested");

  const amountOf = (row) =>
    Number.isSafeInteger(row.finalPrice)
      ? row.finalPrice
      : row.estimatedPrice;

  const byMonth = new Map();

  for (const row of completed) {
    const month = monthKey(row.updatedAt || row.createdAt);
    const current = byMonth.get(month) || {
      month,
      count: 0,
      total: 0,
    };

    current.count += 1;
    current.total += amountOf(row);
    byMonth.set(month, current);
  }

  return {
    completed: {
      count: completed.length,
      total: completed.reduce((sum, row) => sum + amountOf(row), 0),
      rows: completed,
    },
    inProgress: {
      count: progress.length,
      total: progress.reduce((sum, row) => sum + amountOf(row), 0),
      rows: progress,
    },
    pending: {
      count: pending.length,
      total: pending.reduce((sum, row) => sum + amountOf(row), 0),
      rows: pending,
    },
    declined: by("Declined", "Cancelled").length,
    months: [...byMonth.values()].sort((a, b) =>
      b.month.localeCompare(a.month),
    ),
  };
}
export function summarizePerformance(bookings) {
  const decided = bookings.filter(row => row.status !== "Requested"); const accepted = bookings.filter(row => ["Accepted", "Paid", "Completed"].includes(row.status)); const completed = bookings.filter(row => row.status === "Completed");
  const percent = (value, count) => count ? Math.round(value / count * 100) : 0;
  return { responseRate: percent(decided.length, bookings.length), acceptanceRate: percent(accepted.length, decided.length), completionRate: percent(completed.length, accepted.length) };
}


export function calculateTransactionSplit(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Nominal transaksi tidak valid.");
  }

  const commission = Math.round(amount * 0.05);

  return {
    gross: amount,
    commissionRate: 5,
    commission,
    sellerNet: amount - commission,
  };
}
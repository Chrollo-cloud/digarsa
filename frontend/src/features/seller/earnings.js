// Earnings are ESTIMATES derived from each booking's initial price. There is no
// payment, payout, or fee system yet, so none of these figures are money moved.
const sum = (rows) => rows.reduce((total, row) => total + row.estimatedPrice, 0);

export function monthKey(iso) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    : "unknown";
}
export function summarizeEarnings(bookings) {
  const by = (...statuses) =>
    bookings.filter((booking) => statuses.includes(booking.status));
  const completed = by("Completed");
  const progress = by("Accepted", "Paid");
  const pending = by("Requested");
  const months = new Map();
  for (const booking of completed) {
    const key = monthKey(booking.updatedAt || booking.createdAt);
    const row = months.get(key) || { month: key, count: 0, total: 0 };
    row.count += 1;
    row.total += booking.estimatedPrice;
    months.set(key, row);
  }
  return {
    completed: { count: completed.length, total: sum(completed), rows: completed },
    inProgress: { count: progress.length, total: sum(progress), rows: progress },
    pending: { count: pending.length, total: sum(pending), rows: pending },
    declined: by("Declined", "Cancelled").length,
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
  };
}

export function summarizePerformance(bookings) {
  const decided = bookings.filter((booking) => booking.status !== "Requested");
  const accepted = bookings.filter((booking) =>
    ["Accepted", "Paid", "Completed"].includes(booking.status),
  );
  const completed = bookings.filter((booking) => booking.status === "Completed");
  const percent = (value, total) =>
    total ? Math.round((value / total) * 100) : 0;
  return {
    responseRate: percent(decided.length, bookings.length),
    acceptanceRate: percent(accepted.length, decided.length),
    completionRate: percent(completed.length, accepted.length),
  };
}

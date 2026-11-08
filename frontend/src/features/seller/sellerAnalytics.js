// Read models only: no writes, payment events, or synthesized historical statuses.
export function summarizeSellerDashboard(bookings, services) {
  const count = (status) =>
    bookings.filter((row) => row.status === status).length;
  return {
    requested: count("Requested"),
    activeServices: services.filter((row) => row.active && !row.hidden).length,
    accepted: count("Accepted"),
    completed: count("Completed"),
    total: bookings.length,
    estimatedCompleted: bookings
      .filter((row) => row.status === "Completed")
      .reduce((sum, row) => sum + row.estimatedPrice, 0),
  };
}
const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Requests are counted by createdAt in the viewer's local timezone. Status changes
// do not move requests to a different bucket or masquerade as completion events.
export function aggregateBookingTrend(
  bookings,
  period = "week",
  anchor = new Date(),
) {
  if (
    !["week", "month", "year"].includes(period) ||
    !Number.isFinite(anchor.getTime())
  )
    throw new Error("Periode analitik tidak valid.");
  const monthly = period === "year";
  const start = monthly
    ? new Date(anchor.getFullYear(), anchor.getMonth() - 11, 1)
    : new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() - (period === "week" ? 6 : 29),
      );
  const series = [];
  const cursor = new Date(start);
  while (cursor <= anchor) {
    series.push({
      key: monthly ? dateKey(cursor).slice(0, 7) : dateKey(cursor),
      date: cursor.toISOString(),
      count: 0,
    });
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  const buckets = new Map(series.map((row) => [row.key, row]));
  for (const booking of bookings) {
    const created = new Date(booking.createdAt);
    if (
      !Number.isFinite(created.getTime()) ||
      created < start ||
      created > anchor
    )
      continue;
    const key = monthly ? dateKey(created).slice(0, 7) : dateKey(created);
    const bucket = buckets.get(key);
    if (bucket) bucket.count++;
  }
  return series;
}

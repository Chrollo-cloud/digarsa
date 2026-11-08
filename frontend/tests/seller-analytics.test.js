import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateBookingTrend,
  summarizeSellerDashboard,
} from "../src/features/seller/sellerAnalytics.js";

const anchor = new Date(2026, 10, 8, 12);
const booking = (day, status = "Requested", estimatedPrice = 1000000) => ({
  createdAt: new Date(2026, 10, day, 10).toISOString(),
  status,
  estimatedPrice,
});
test("Seller KPIs use current lifecycle statuses and published active services without inventing payments", () => {
  const rows = [
    booking(8),
    booking(7, "Accepted"),
    booking(6, "Paid"),
    booking(5, "Completed", 2500000),
    booking(4, "Declined"),
    booking(3, "Cancelled"),
  ];
  const result = summarizeSellerDashboard(rows, [
    { active: true, hidden: false, availability: "Open" },
    { active: true, hidden: false, availability: "Full-book" },
    { active: true, hidden: true },
    { active: false, hidden: false },
  ]);
  assert.deepEqual(result, {
    requested: 1,
    activeServices: 2,
    accepted: 1,
    completed: 1,
    total: 6,
    estimatedCompleted: 2500000,
  });
  assert.deepEqual(summarizeSellerDashboard([], []), {
    requested: 0,
    activeServices: 0,
    accepted: 0,
    completed: 0,
    total: 0,
    estimatedCompleted: 0,
  });
});
test("seven-day chart counts actual request dates, excludes future/invalid/out-of-window dates", () => {
  const rows = [
    booking(8),
    booking(8, "Declined"),
    booking(2, "Completed"),
    booking(1),
    booking(9),
    { createdAt: "invalid" },
  ];
  const original = structuredClone(rows);
  const series = aggregateBookingTrend(rows, "week", anchor);
  assert.equal(series.length, 7);
  assert.equal(series[0].key, "2026-11-02");
  assert.equal(series.at(-1).key, "2026-11-08");
  assert.equal(series[0].count, 1);
  assert.equal(series.at(-1).count, 2);
  assert.equal(
    series.reduce((sum, row) => sum + row.count, 0),
    3,
  );
  assert.deepEqual(rows, original);
});
test("month/year filters handle calendar boundaries and zero-data periods honestly", () => {
  const month = aggregateBookingTrend([booking(8)], "month", anchor);
  assert.equal(month.length, 30);
  assert.equal(month[0].key, "2026-10-10");
  const rows = [
    { createdAt: new Date(2025, 11, 1).toISOString() },
    { createdAt: new Date(2026, 0, 31).toISOString() },
    booking(8),
  ];
  const year = aggregateBookingTrend(rows, "year", anchor);
  assert.equal(year.length, 12);
  assert.equal(year[0].key, "2025-12");
  assert.equal(year.at(-1).key, "2026-11");
  assert.equal(
    year.reduce((sum, row) => sum + row.count, 0),
    3,
  );
  assert.ok(
    aggregateBookingTrend([], "week", anchor).every((row) => row.count === 0),
  );
});
test("status changes never masquerade as new requests or completed-date history", () => {
  const rows = [booking(3), booking(8, "Completed")];
  const before = aggregateBookingTrend(rows, "week", anchor);
  rows[0].status = "Accepted";
  rows[0].updatedAt = anchor.toISOString();
  assert.deepEqual(aggregateBookingTrend(rows, "week", anchor), before);
  assert.throws(
    () => aggregateBookingTrend([], "invalid", anchor),
    /tidak valid/,
  );
});

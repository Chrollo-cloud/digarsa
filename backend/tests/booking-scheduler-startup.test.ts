import assert from "node:assert/strict";
import { test } from "node:test";
import { startBookingSchedulerIfEnabled } from "../src/lib/booking-scheduler-startup.ts";

test("false disables the scheduler starter entirely", () => {
  let starts = 0;
  const started = startBookingSchedulerIfEnabled("false", () => { starts += 1; });
  assert.equal(started, false);
  assert.equal(starts, 0);
});

test("true keeps the scheduler startup path without running scheduler jobs in this test", () => {
  let starts = 0;
  const started = startBookingSchedulerIfEnabled("true", () => { starts += 1; });
  assert.equal(started, true);
  assert.equal(starts, 1);
});

test("an unset setting preserves the existing enabled-by-default behavior", () => {
  let starts = 0;
  const started = startBookingSchedulerIfEnabled(undefined, () => { starts += 1; });
  assert.equal(started, true);
  assert.equal(starts, 1);
});

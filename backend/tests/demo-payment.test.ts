import test from "node:test";
import assert from "node:assert/strict";
import { isDemoPaymentEnabled, matchesDemoPaymentAmount } from "../src/modules/payments/demo-payment.js";

test("demo payment is disabled unless explicitly enabled outside production", () => {
  assert.equal(isDemoPaymentEnabled({ NODE_ENV: "test" }), false);
  assert.equal(isDemoPaymentEnabled({ NODE_ENV: "test", PAYMENT_DEMO_MODE: "false" }), false);
  assert.equal(isDemoPaymentEnabled({ NODE_ENV: "test", PAYMENT_DEMO_MODE: "true" }), true);
  assert.equal(isDemoPaymentEnabled({ NODE_ENV: "production", PAYMENT_DEMO_MODE: "true" }), false);
});

test("demo payment amount and currency must match the server snapshot exactly", () => {
  const expected = { amount: 1_050_000, currency: "IDR" };
  assert.equal(matchesDemoPaymentAmount({ amount: 1_050_000, currency: "IDR" }, expected), true);
  assert.equal(matchesDemoPaymentAmount({ amount: 1_049_999, currency: "IDR" }, expected), false);
  assert.equal(matchesDemoPaymentAmount({ amount: "1050000", currency: "IDR" }, expected), false);
  assert.equal(matchesDemoPaymentAmount({ amount: 1_050_000, currency: "USD" }, expected), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { calculateRefund, POSTGRES_INT_MAX, priceBuyerTotal } from "../src/modules/payments/pricing-policy.js";

test("buyer-paid admin fee is rounded half up and seller receives full seller price", () => {
  assert.deepEqual(priceBuyerTotal(1_000_000), {
    sellerPrice: 1_000_000, adminFee: 50_000, buyerTotal: 1_050_000,
    pricingPolicyVersion: "buyer-paid-admin-fee-v1",
  });
  assert.equal(priceBuyerTotal(10).adminFee, 1);
  assert.equal(priceBuyerTotal(30).adminFee, 2);
});

test("buyer total remains inside PostgreSQL INT at the exact maximum valid seller price", () => {
  assert.deepEqual(priceBuyerTotal(2_045_222_520), {
    sellerPrice: 2_045_222_520, adminFee: 102_261_126, buyerTotal: POSTGRES_INT_MAX - 1,
    pricingPolicyVersion: "buyer-paid-admin-fee-v1",
  });
  assert.deepEqual(priceBuyerTotal(2_045_222_521), {
    sellerPrice: 2_045_222_521, adminFee: 102_261_126, buyerTotal: POSTGRES_INT_MAX,
    pricingPolicyVersion: "buyer-paid-admin-fee-v1",
  });
  assert.throws(() => priceBuyerTotal(2_045_222_522), /buyer total exceeds PostgreSQL INT range/);
});

test("buyer pricing rejects invalid, zero, negative, non-integer, and out-of-range values", () => {
  for (const value of [0, -1, 1.5, POSTGRES_INT_MAX + 1, Number.MAX_SAFE_INTEGER, POSTGRES_INT_MAX]) {
    assert.throws(() => priceBuyerTotal(value), RangeError, `seller price ${value} must be rejected`);
  }
});

test("partial and full refunds proportionally refund the administration fee", () => {
  assert.deepEqual(calculateRefund({
    originalSellerPrice: 1_000_000, originalAdminFee: 50_000,
    sellerPriceRefund: 500_000, capturedAmount: 1_050_000,
    successfulRefundAmount: 0,
  }), {
    sellerPriceRefund: 500_000, adminFeeRefund: 25_000,
    totalRefund: 525_000, remainingRefundableAfter: 525_000,
    requestedProportionalTotal: 525_000,
  });
  assert.equal(calculateRefund({
    originalSellerPrice: 1_000_000, originalAdminFee: 50_000,
    sellerPriceRefund: 1_000_000, capturedAmount: 1_050_000,
    successfulRefundAmount: 0, isFinalRefund: true,
  }).totalRefund, 1_050_000);
});

test("zero seller-price refund returns zero administration fee", () => {
  const result = calculateRefund({
    originalSellerPrice: 1_000_000, originalAdminFee: 50_000,
    sellerPriceRefund: 0, capturedAmount: 1_050_000,
    successfulRefundAmount: 0, isFinalRefund: true,
  });
  assert.equal(result.adminFeeRefund, 0);
  assert.equal(result.totalRefund, 0);
});

test("cumulative round-half-up refunds reconcile the final admin-fee residual exactly", () => {
  const first = calculateRefund({
    originalSellerPrice: 101, originalAdminFee: 5, sellerPriceRefund: 50,
    capturedAmount: 106, successfulRefundAmount: 0,
  });
  assert.equal(first.adminFeeRefund, 2);
  const final = calculateRefund({
    originalSellerPrice: 101, originalAdminFee: 5, sellerPriceRefund: 51,
    capturedAmount: 106, successfulRefundAmount: first.totalRefund,
    successfulSellerPriceRefund: 50, successfulAdminFeeRefund: first.adminFeeRefund,
    isFinalRefund: true,
  });
  assert.equal(final.adminFeeRefund, 3);
  assert.equal(first.totalRefund + final.totalRefund, 106);
});

test("refunds reject amounts above the remaining captured payment", () => {
  assert.throws(() => calculateRefund({
    originalSellerPrice: 100, originalAdminFee: 5, sellerPriceRefund: 100,
    capturedAmount: 100, successfulRefundAmount: 0,
  }), /remaining captured amount/);
});

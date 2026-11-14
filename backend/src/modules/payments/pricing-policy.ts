export const PRICING_POLICY_VERSION = "buyer-paid-admin-fee-v1";
export const ADMIN_FEE_BPS = 500;
export const POSTGRES_INT_MAX = 2_147_483_647;

function nonNegativeSafeInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > POSTGRES_INT_MAX) {
    throw new RangeError(`${label} must fit a non-negative PostgreSQL INT IDR amount`);
  }
  return BigInt(value);
}

/** Round a non-negative rational amount to whole rupiah using round-half-up. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function priceBuyerTotal(sellerPrice: number) {
  const seller = nonNegativeSafeInteger(sellerPrice, "sellerPrice");
  if (seller === 0n) throw new RangeError("sellerPrice must be greater than zero");
  const fee = roundHalfUp(seller * BigInt(ADMIN_FEE_BPS), 10_000n);
  const total = seller + fee;
  if (total > BigInt(POSTGRES_INT_MAX)) throw new RangeError("buyer total exceeds PostgreSQL INT range");
  return { sellerPrice, adminFee: Number(fee), buyerTotal: Number(total), pricingPolicyVersion: PRICING_POLICY_VERSION };
}

export function calculateRefund(input: {
  originalSellerPrice: number;
  originalAdminFee: number;
  sellerPriceRefund: number;
  capturedAmount: number;
  successfulRefundAmount: number;
  successfulSellerPriceRefund?: number;
  successfulAdminFeeRefund?: number;
  isFinalRefund?: boolean;
}) {
  const originalSellerPrice = nonNegativeSafeInteger(input.originalSellerPrice, "originalSellerPrice");
  const originalAdminFee = nonNegativeSafeInteger(input.originalAdminFee, "originalAdminFee");
  const sellerPriceRefund = nonNegativeSafeInteger(input.sellerPriceRefund, "sellerPriceRefund");
  const capturedAmount = nonNegativeSafeInteger(input.capturedAmount, "capturedAmount");
  const successfulRefundAmount = nonNegativeSafeInteger(input.successfulRefundAmount, "successfulRefundAmount");
  const successfulSellerPriceRefund = nonNegativeSafeInteger(input.successfulSellerPriceRefund ?? 0, "successfulSellerPriceRefund");
  const successfulAdminFeeRefund = nonNegativeSafeInteger(input.successfulAdminFeeRefund ?? 0, "successfulAdminFeeRefund");
  if (originalSellerPrice <= 0n || sellerPriceRefund > originalSellerPrice) throw new RangeError("seller-price refund exceeds original seller price");
  if (successfulRefundAmount > capturedAmount) throw new RangeError("successful refunds exceed captured amount");
  if (successfulSellerPriceRefund + sellerPriceRefund > originalSellerPrice || successfulAdminFeeRefund > originalAdminFee) throw new RangeError("cumulative refund components exceed the original price snapshot");
  const remaining = capturedAmount - successfulRefundAmount;
  const cumulativeSellerRefund = successfulSellerPriceRefund + sellerPriceRefund;
  const cumulativeAdminTarget = cumulativeSellerRefund === 0n
    ? 0n
    : roundHalfUp(originalAdminFee * cumulativeSellerRefund, originalSellerPrice);
  const proportionalAdmin = cumulativeAdminTarget > successfulAdminFeeRefund
    ? cumulativeAdminTarget - successfulAdminFeeRefund
    : 0n;
  const requested = sellerPriceRefund + proportionalAdmin;
  const adminFeeRefund = input.isFinalRefund && cumulativeSellerRefund === originalSellerPrice
    ? originalAdminFee - successfulAdminFeeRefund
    : proportionalAdmin;
  const total = sellerPriceRefund + adminFeeRefund;
  if (total > remaining) throw new RangeError("refund exceeds remaining captured amount");
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("refund exceeds safe integer range");
  return {
    sellerPriceRefund: Number(sellerPriceRefund),
    adminFeeRefund: Number(adminFeeRefund),
    totalRefund: Number(total),
    remainingRefundableAfter: Number(remaining - total),
    requestedProportionalTotal: Number(requested),
  };
}

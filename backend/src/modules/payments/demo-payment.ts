export const DEMO_PAYMENT_LABEL = "DEMO PAYMENT — NO REAL TRANSACTION";

export function isDemoPaymentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.PAYMENT_DEMO_MODE === "true";
}

export function matchesDemoPaymentAmount(
  input: { amount: unknown; currency: unknown },
  expected: { amount: number; currency: string },
): boolean {
  return Number.isSafeInteger(input.amount)
    && input.amount === expected.amount
    && input.currency === expected.currency;
}

import assert from "node:assert/strict";
import test from "node:test";
import { additionalRevisionOfferSchema } from "../src/modules/bookings/additional-revision.schema.js";

const validOffer = {
  scope: "Create one extra image asset",
  terms: "One delivery with one review cycle",
  seller_price: 2_045_222_521,
  estimated_duration_hours: 8,
};

test("additional revision accepts seller price whose rounded total equals PostgreSQL INT max", () => {
  assert.equal(additionalRevisionOfferSchema.safeParse(validOffer).success, true);
});

test("additional revision rejects a seller price whose 5% fee overflows PostgreSQL INT before controller writes", () => {
  const parsed = additionalRevisionOfferSchema.safeParse({ ...validOffer, seller_price: 2_045_222_522 });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === "seller_price" && issue.message.includes("PostgreSQL INT")));
  }
});

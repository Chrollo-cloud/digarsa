import test from "node:test";
import assert from "node:assert/strict";
import { enqueueInAppNotices } from "../src/modules/bookings/notification-outbox.ts";

test("cycle outbox payload and row carry the same delivery-cycle identity", async () => {
  let row: any;
  const tx = { notificationOutbox: { create: async ({ data }: any) => { row = data; return data; } } } as never;
  await enqueueInAppNotices(tx, "delivery-cycle:dc1:completed:event1", "BOOKING_COMPLETED", [
    { userId: "seller-user", type: "BOOKING_UPDATE", title: "Completed", refId: "booking1" },
  ], "dc1");
  assert.equal(row.eventKey, "delivery-cycle:dc1:completed:event1");
  assert.equal(row.deliveryCycleId, "dc1");
  assert.deepEqual(row.payload[0].delivery_cycle_id, "dc1");
});

test("non-cycle notices retain their existing payload contract", async () => {
  let row: any;
  const tx = { notificationOutbox: { create: async ({ data }: any) => { row = data; return data; } } } as never;
  await enqueueInAppNotices(tx, "booking:requested:b1", "BOOKING_REQUESTED", [
    { userId: "seller-user", type: "BOOKING_UPDATE", title: "New booking", refId: "b1" },
  ]);
  assert.equal(row.deliveryCycleId, undefined);
  assert.equal(row.payload[0].delivery_cycle_id, undefined);
});

test("revision outbox notices retain both cycle and revision references in the payload", async () => {
  let row: any;
  const tx = { notificationOutbox: { create: async ({ data }: any) => { row = data; return data; } } } as never;
  await enqueueInAppNotices(tx, "delivery-cycle:dc1:revision:r1:event1", "REVISION_REQUESTED", [
    { userId: "seller-user", type: "BOOKING_UPDATE", title: "Revision requested", refId: "booking1" },
  ], "dc1", "r1");
  assert.equal(row.deliveryCycleId, "dc1");
  assert.equal(row.payload[0].delivery_cycle_id, "dc1");
  assert.equal(row.payload[0].revision_id, "r1");
});

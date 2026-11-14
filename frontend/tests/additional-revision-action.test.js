import assert from "node:assert/strict";
import test from "node:test";
import { runAdditionalRevisionRequestAction } from "../src/features/seller/additionalRevisionAction.js";

test("seller Reject action calls the reject endpoint once and keeps loading/error handling", async () => {
  const actionLock = { current: false };
  const states = { pending: [], errors: [], successes: [], inputs: [], refreshes: 0, calls: [] };
  let releaseRequest;
  const requestGate = new Promise((resolve) => { releaseRequest = resolve; });
  const action = runAdditionalRevisionRequestAction({
    event: null,
    actionLock,
    bookingId: "booking-1",
    requestId: "request-1",
    action: "REJECT",
    input: { message: "This request is outside the agreed scope." },
    setPending: (value) => states.pending.push(value),
    setError: (value) => states.errors.push(value),
    setSuccess: (value) => states.successes.push(value),
    resetInput: (requestId) => states.inputs.push(requestId),
    logout: () => assert.fail("logout should not run"),
    formatError: (error) => error.message,
    refresh: async () => { states.refreshes += 1; },
    actions: {
      rejectRequest: async (...args) => { states.calls.push(args); await requestGate; return { id: "request-1" }; },
    },
  });

  assert.deepEqual(states.pending, [true]);
  assert.equal(await runAdditionalRevisionRequestAction({
    event: null,
    actionLock,
    bookingId: "booking-1",
    requestId: "request-1",
    action: "REJECT",
    input: { message: "duplicate" },
    setPending: () => assert.fail("duplicate submission changed loading state"),
    setError: () => {}, setSuccess: () => {}, resetInput: () => {}, logout: () => {},
    formatError: (error) => error.message, refresh: async () => {}, actions: { rejectRequest: async () => assert.fail("duplicate request sent") },
  }), false);
  assert.equal(states.calls.length, 1);
  assert.deepEqual(states.calls[0], ["booking-1", "request-1", "This request is outside the agreed scope."]);

  releaseRequest();
  assert.equal(await action, true);
  assert.deepEqual(states.pending, [true, false]);
  assert.deepEqual(states.errors, [""]);
  assert.deepEqual(states.successes, ["", "Request response saved by the server."]);
  assert.deepEqual(states.inputs, ["request-1"]);
  assert.equal(states.refreshes, 1);
  assert.equal(actionLock.current, false);
});

test("seller Reject action reports API errors and releases the submission lock", async () => {
  const states = { pending: [], errors: [] };
  const actionLock = { current: false };
  const result = await runAdditionalRevisionRequestAction({
    event: null, actionLock, bookingId: "booking-1", requestId: "request-1", action: "REJECT", input: {},
    setPending: (value) => states.pending.push(value), setError: (value) => states.errors.push(value),
    setSuccess: () => {}, resetInput: () => {}, logout: () => {}, formatError: (error) => error.message,
    refresh: async () => {}, actions: { rejectRequest: async () => { throw new Error("server rejected request"); } },
  });
  assert.equal(result, false);
  assert.deepEqual(states.pending, [true, false]);
  assert.deepEqual(states.errors, ["", "server rejected request"]);
  assert.equal(actionLock.current, false);
});

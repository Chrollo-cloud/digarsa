import test from "node:test";
import assert from "node:assert/strict";
import { isAssistanceSlaOverdue, isRevisionAssistanceActive, nextRevisionAssistanceStatus } from "../src/modules/bookings/revision-assistance.ts";
import { remainingResponseMilliseconds, responseDeadlineFromRemaining, syncRevisionResponseClocks } from "../src/modules/bookings/revision-response-clock.ts";

const at = (ms: number) => new Date(ms);

test("admin assistance implements only the approved status transitions", () => {
  assert.equal(nextRevisionAssistanceStatus("OPEN", "START_REVIEW"), "IN_REVIEW");
  assert.equal(nextRevisionAssistanceStatus("IN_REVIEW", "RESOLVE"), "RESOLVED");
  assert.equal(nextRevisionAssistanceStatus("RESOLVED", "CLOSE"), "CLOSED");
  assert.equal(nextRevisionAssistanceStatus("RESOLVED", "REOPEN"), "IN_REVIEW");
  assert.throws(() => nextRevisionAssistanceStatus("OPEN", "RESOLVE"), RangeError);
  assert.throws(() => nextRevisionAssistanceStatus("CLOSED", "REOPEN"), RangeError);
  assert.equal(isRevisionAssistanceActive("OPEN"), true);
  assert.equal(isRevisionAssistanceActive("IN_REVIEW"), true);
  assert.equal(isRevisionAssistanceActive("RESOLVED"), false);
  assert.equal(isRevisionAssistanceActive("CLOSED"), false);
});

test("admin handling SLA is independent and overdue remains an active case", () => {
  assert.equal(isAssistanceSlaOverdue(at(48 * 60 * 60 * 1000), at(48 * 60 * 60 * 1000)), true);
  assert.equal(isAssistanceSlaOverdue(at(48 * 60 * 60 * 1000), at(48 * 60 * 60 * 1000 - 1)), false);
  assert.equal(isRevisionAssistanceActive("IN_REVIEW"), true);
});

test("response clock helpers preserve exact remainder, including an already-expired zero", () => {
  assert.equal(remainingResponseMilliseconds(at(1000), at(250)), 750);
  assert.equal(remainingResponseMilliseconds(at(1000), at(1001)), 0);
  assert.equal(responseDeadlineFromRemaining(at(1000), 750).getTime(), 1750);
  assert.equal(responseDeadlineFromRemaining(at(1000), 0).getTime(), 1000);
  assert.throws(() => responseDeadlineFromRemaining(at(0), -1), RangeError);
});

function clockFixture(kind: "SELLER_RESPONSE" | "CUSTOMER_CLARIFICATION" = "SELLER_RESPONSE") {
  const revision: any = {
    id: "r1", status: kind === "SELLER_RESPONSE" ? "REQUESTED" : "WAITING_CUSTOMER",
    sellerResponseDeadlineAt: at(100_000), sellerResponsePausedAt: null, sellerResponseRemainingMs: null,
  };
  const clarification: any = {
    id: "c1", responseDueAt: at(100_000), responsePausedAt: null, responseRemainingMs: null,
  };
  const assistance: any = { id: "a1", status: "OPEN", responseClockType: kind, responseClarificationId: kind === "CUSTOMER_CLARIFICATION" ? "c1" : null };
  const pauses: any[] = [];
  const resumes: any[] = [];
  let quotaWrites = 0;
  const tx: any = {
    revisionRequest: {
      findUnique: async () => ({ ...revision }),
      update: async ({ data }: any) => Object.assign(revision, data),
    },
    revisionEscalationRequest: { findMany: async () => ["OPEN", "IN_REVIEW"].includes(assistance.status) ? [{ ...assistance }] : [] },
    revisionClarification: {
      findFirst: async () => ({ ...clarification, requesterRole: "SELLER", status: "WAITING_CUSTOMER" }),
      update: async ({ data }: any) => Object.assign(clarification, data),
    },
    revisionResponseClockPause: {
      create: async ({ data }: any) => { const row = { id: `p${pauses.length + 1}`, ...data, resume: null }; pauses.push(row); return row; },
      findFirst: async () => [...pauses].reverse().find((row) => row.resume === null) ?? null,
    },
    revisionResponseClockResume: {
      create: async ({ data }: any) => { const row = { id: `x${resumes.length + 1}`, ...data }; resumes.push(row); pauses.find((pause) => pause.id === data.pauseId).resume = row; return row; },
    },
    revisionQuotaLedger: { create: async () => { quotaWrites++; } },
  };
  return { tx, revision, clarification, assistance, pauses, resumes, quotaWrites: () => quotaWrites };
}

test("seller deadline pauses once through OPEN and IN_REVIEW, then resumes exact time once", async () => {
  const f = clockFixture();
  await syncRevisionResponseClocks(f.tx, "r1", at(25_000), "admin1");
  assert.equal(f.revision.sellerResponseRemainingMs, 75_000);
  assert.equal(f.revision.sellerResponsePausedAt.getTime(), 25_000);
  f.assistance.status = "IN_REVIEW";
  await syncRevisionResponseClocks(f.tx, "r1", at(60_000), "admin2");
  assert.equal(f.pauses.length, 1);
  f.assistance.status = "RESOLVED";
  await syncRevisionResponseClocks(f.tx, "r1", at(200_000), "admin3");
  assert.equal(f.revision.sellerResponseDeadlineAt.getTime(), 275_000);
  assert.equal(f.revision.sellerResponseRemainingMs, null);
  await syncRevisionResponseClocks(f.tx, "r1", at(300_000), "admin4");
  assert.equal(f.resumes.length, 1);
  assert.equal(f.quotaWrites(), 0);
});

test("clarification deadline stays paused while another assistance remains active", async () => {
  const f = clockFixture("CUSTOMER_CLARIFICATION");
  await syncRevisionResponseClocks(f.tx, "r1", at(40_000), "seller1");
  assert.equal(f.clarification.responseRemainingMs, 60_000);
  f.assistance.status = "IN_REVIEW";
  await syncRevisionResponseClocks(f.tx, "r1", at(80_000), "admin1");
  assert.equal(f.pauses.length, 1);
  f.tx.revisionEscalationRequest.findMany = async () => [
    { id: "a1", responseClockType: "CUSTOMER_CLARIFICATION", responseClarificationId: "c1" },
    { id: "a2", responseClockType: "CUSTOMER_CLARIFICATION", responseClarificationId: "c1" },
  ];
  f.assistance.status = "RESOLVED";
  await syncRevisionResponseClocks(f.tx, "r1", at(100_000), "admin2");
  assert.equal(f.resumes.length, 0);
  f.tx.revisionEscalationRequest.findMany = async () => [];
  await syncRevisionResponseClocks(f.tx, "r1", at(110_000), "admin3");
  assert.equal(f.clarification.responseDueAt.getTime(), 170_000);
  assert.equal(f.resumes.length, 1);
  assert.equal(f.quotaWrites(), 0);
});

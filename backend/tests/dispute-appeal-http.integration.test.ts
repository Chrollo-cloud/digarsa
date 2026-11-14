import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import app from "../src/app.ts";
import { prisma } from "./support/direct-prisma-shim.mjs";
import { createDeliveryCycle } from "../src/modules/bookings/delivery-cycle.ts";
import { checkCompletionEligibility } from "../src/modules/bookings/completion-eligibility.ts";

const target = new URL(process.env.DIRECT_URL_CONCURRENCY_TEST!);
assert.equal(target.hostname, "localhost");
assert.equal(target.port || "5432", "5432");
assert.equal(decodeURIComponent(target.pathname.slice(1)), "digarsa_concurrency_test");
assert.equal(decodeURIComponent(target.username), "digarsa_concurrency_test_user");
assert.equal(target.searchParams.get("schema") || "public", "public");

const jwtSecret = `phase-test-${randomUUID()}-secret-at-least-32-chars`;
process.env.JWT_SECRET = jwtSecret;
const fixtureTag = `phase59651-${randomUUID()}`;
let server: ReturnType<typeof app.listen>;
let origin = "";
const createdIds: { userIds: string[]; bookingIds: string[]; serviceIds: string[]; sellerIds: string[]; categoryIds: string[]; paymentIds: string[] } = { userIds: [], bookingIds: [], serviceIds: [], sellerIds: [], categoryIds: [], paymentIds: [] };

type Principal = { id: string; role: "USER" | "ADMIN"; token: string; sellerId?: string };
const people: Record<string, Principal> = {};

async function person(key: string, role: "USER" | "ADMIN" = "USER", seller = false, accountStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE"): Promise<Principal> {
  const id = randomUUID();
  const user = await prisma.user.create({ data: { id, email: `${fixtureTag}-${key}@test.invalid`, passwordHash: "test-only", name: `${fixtureTag} ${key}`, role, accountStatus } });
  createdIds.userIds.push(user.id);
  let sellerId: string | undefined;
  if (seller) {
    const profile = await prisma.sellerProfile.create({ data: { id: randomUUID(), userId: user.id, displayName: `${fixtureTag} ${key}`, region: "integration-test" } });
    sellerId = profile.id; createdIds.sellerIds.push(profile.id);
  }
  const token = jwt.sign({ sub: user.id, role, tokenVersion: user.tokenVersion }, jwtSecret, { algorithm: "HS256", expiresIn: "10m" });
  const principal = { id: user.id, role, token, sellerId };
  people[key] = principal;
  return principal;
}

async function booking(customer: Principal, seller: Principal, withPayment = false, revisionFreeCount = 2, deliveredAt = new Date()) {
  const category = await prisma.category.create({ data: { name: `${fixtureTag} ${randomUUID()}`, slug: `${fixtureTag}-${randomUUID()}` } });
  createdIds.categoryIds.push(category.id);
  const service = await prisma.service.create({ data: { id: randomUUID(), sellerId: seller.sellerId!, categoryId: category.id, title: `${fixtureTag} service`, description: "Disposable integration fixture", price: 1700, region: "integration-test", revisionFreeCount, revisionRequestWindowHours: 72, revisionTerms: "fixture policy", moderationStatus: "APPROVED" } });
  createdIds.serviceIds.push(service.id);
  const at = deliveredAt;
  const row = await prisma.booking.create({ data: { id: randomUUID(), serviceId: service.id, customerId: customer.id, sellerId: seller.sellerId!, status: "DELIVERED", price: 1700, fee: 0, total: 1700, deliveredAt: at, revisionPolicyVersion: 1, revisionPolicyHash: randomUUID().replaceAll("-", "").padEnd(64, "a"), revisionFreeCount, revisionRequestWindowDuration: 72, revisionRequestWindowUnit: "ELAPSED_HOURS", revisionRequestWindowAnchor: "LATEST_SERVER_PERSISTED_DELIVERY", revisionTermsSnapshot: "fixture policy", revisionPolicyAcknowledgedAt: at } });
  createdIds.bookingIds.push(row.id);
  await prisma.$transaction((tx) => createDeliveryCycle(tx, row.id, at));
  if (withPayment) {
    const payment = await prisma.payment.create({ data: { bookingId: row.id, orderId: `${fixtureTag}-${randomUUID()}`, amount: row.total, status: "PAID", payoutStatus: "HELD", paidAt: at } });
    createdIds.paymentIds.push(payment.id);
  }
  return row;
}

async function request(method: string, path: string, principal?: Principal, body?: unknown) {
  return fetch(`${origin}/api/v1${path}`, {
    method,
    headers: { ...(principal ? { authorization: `Bearer ${principal.token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function disputeBody(category = "OTHER") { return { category, description: `${fixtureTag}: detailed dispute description for integration coverage.` }; }
async function openDispute(bookingId: string, customer: Principal) {
  const response = await request("POST", `/me/bookings/${bookingId}/disputes`, customer, disputeBody());
  const body = await response.text();
  assert.equal(response.status, 201, body);
  return JSON.parse(body).data;
}

before(async () => {
  const identity = await prisma.$queryRaw<Array<{ database: string; role: string; schema: string; server_address: string; port: number; is_superuser: boolean }>>`SELECT current_database() AS database, current_user AS role, current_schema() AS schema, inet_server_addr()::text AS server_address, inet_server_port() AS port, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_superuser`;
  assert.deepEqual(identity[0], { database: "digarsa_concurrency_test", role: "digarsa_concurrency_test_user", schema: "public", server_address: "::1/128", port: 5432, is_superuser: false });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  await person("customer-a"); await person("customer-b");
  await person("seller-a", "USER", true); await person("seller-b", "USER", true);
  await person("admin-a", "ADMIN"); await person("admin-b", "ADMIN"); await person("admin-c", "ADMIN"); await person("admin-inactive", "ADMIN", false, "SUSPENDED");
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
  // Disputes, lifecycle events, bookings, payment rows, and delivery cycles are permanent audit fixtures.
  // User/category/service rows are retained when referenced; no protected history is deleted here.
});

test("unauthenticated and wrong-role HTTP requests are rejected", async () => {
  const unauthenticated = await request("GET", "/admin/disputes");
  assert.equal(unauthenticated.status, 401);
  const invalidToken = await fetch(`${origin}/api/v1/admin/disputes`, { headers: { authorization: "Bearer invalid-token" } });
  assert.equal(invalidToken.status, 401);
  const principal = people["customer-a"]!;
  const claims = jwt.verify(principal.token, jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: principal.id }, select: { role: true, accountStatus: true, tokenVersion: true } });
  assert.equal(claims.sub, principal.id);
  assert.equal(claims.role, stored.role);
  assert.equal(claims.tokenVersion, stored.tokenVersion);
  assert.equal(stored.accountStatus, "ACTIVE");
  const forbidden = await request("GET", "/admin/disputes", people["customer-a"]);
  assert.equal(forbidden.status, 403, await forbidden.text());
  const sellerForbidden = await request("GET", "/admin/disputes", people["seller-a"]);
  assert.equal(sellerForbidden.status, 403);
  const adminOnPartyRoute = await request("POST", `/me/bookings/${randomUUID()}/disputes`, people["admin-a"], disputeBody());
  assert.equal(adminOnPartyRoute.status, 403);
});

test("customer and seller cannot read or write another party's booking dispute", async () => {
  const row = await booking(people["customer-a"]!, people["seller-a"]!);
  const dispute = await openDispute(row.id, people["customer-a"]!);
  const foreignCustomer = await request("GET", `/me/disputes/${dispute.id}`, people["customer-b"]);
  assert.equal(foreignCustomer.status, 404);
  const foreignSellerRead = await request("GET", `/seller/disputes/${dispute.id}`, people["seller-b"]);
  assert.equal(foreignSellerRead.status, 404);
  const foreignSellerWrite = await request("POST", `/seller/bookings/${row.id}/disputes`, people["seller-b"], disputeBody());
  assert.equal(foreignSellerWrite.status, 404);
  const accessRows = await prisma.disputeEvidenceAccess.count({ where: { disputeId: dispute.id, viewerId: { in: [people["customer-b"]!.id, people["seller-b"]!.id] } } });
  assert.equal(accessRows, 0);
});

test("seller submission requires a profile and the booking's own seller profile", async () => {
  const noProfile = await person("seller-no-profile");
  const row = await booking(people["customer-b"]!, people["seller-a"]!);
  const missingProfile = await request("POST", `/seller/bookings/${row.id}/disputes`, noProfile, disputeBody());
  assert.equal(missingProfile.status, 403);
  const wrongProfile = await request("POST", `/seller/bookings/${row.id}/disputes`, people["seller-b"], disputeBody());
  assert.equal(wrongProfile.status, 404);
  const correctProfile = await request("POST", `/seller/bookings/${row.id}/disputes`, people["seller-a"], disputeBody());
  assert.equal(correctProfile.status, 201, await correctProfile.text());
});

test("dispute cancellation controller leaves payment and payout state unchanged", async () => {
  const row = await booking(people["customer-a"]!, people["seller-a"]!, true);
  const paymentBefore = await prisma.payment.findUniqueOrThrow({ where: { bookingId: row.id } });
  const dispute = await openDispute(row.id, people["customer-a"]!);
  const decision = await request("POST", `/admin/disputes/${dispute.id}/decision`, people["admin-a"], { expected_version: dispute.version, outcome: "CANCEL_BOOKING", reason: "Approved cancellation after dispute review.", permitted_next_action: "Cancel booking through lifecycle coordination." });
  assert.equal(decision.status, 200, await decision.text());
  const paymentAfter = await prisma.payment.findUniqueOrThrow({ where: { bookingId: row.id } });
  assert.deepEqual({ status: paymentAfter.status, payoutStatus: paymentAfter.payoutStatus, amount: paymentAfter.amount, paidAt: paymentAfter.paidAt, rawNotification: paymentAfter.rawNotification }, { status: paymentBefore.status, payoutStatus: paymentBefore.payoutStatus, amount: paymentBefore.amount, paidAt: paymentBefore.paidAt, rawNotification: paymentBefore.rawNotification });
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: row.id } })).status, "CANCELLED");
  assert.equal(await prisma.bookingStatusEvent.count({ where: { bookingId: row.id, source: "ADMIN_DISPUTE_DECISION", toStatus: "CANCELLED" } }), 1);
  const cancelledCycle = await prisma.deliveryCycle.findFirstOrThrow({ where: { bookingId: row.id } });
  assert.equal(cancelledCycle.active, false);
  assert.equal(cancelledCycle.status, "CANCELLED");
  const job = await prisma.deliveryCycleJob.findUniqueOrThrow({ where: { deliveryCycleId: cancelledCycle.id } });
  assert.equal(job.status, "CANCELLED");
});

test("dispute decision and appeal lifecycle use version conflicts and independent reviewers", async () => {
  const row = await booking(people["customer-b"]!, people["seller-a"]!);
  const dispute = await openDispute(row.id, people["customer-b"]!);
  const decisions = await Promise.all(["admin-a", "admin-b"].map((key, index) => request("POST", `/admin/disputes/${dispute.id}/decision`, people[key]!, { expected_version: dispute.version, outcome: index === 0 ? "CANCEL_BOOKING" : "CONTINUE_BOOKING", reason: "Concurrent decision conflict test.", permitted_next_action: "Apply only the winning booking workflow decision." })));
  assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
  const afterDecision = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
  assert.equal(await prisma.disputeEvent.count({ where: { disputeId: dispute.id, eventType: "DECIDED" } }), 1);
  const appealResponse = await request("POST", `/disputes/${dispute.id}/appeals`, people["customer-b"], { reason: "Request an independent review of the decision." });
  const appealBody = await appealResponse.text();
  assert.equal(appealResponse.status, 201, appealBody);
  const appeal = JSON.parse(appealBody).data;
  const makerKey = String(afterDecision.decisionById) === people["admin-a"]!.id ? "admin-a" : "admin-b";
  const independentKey = makerKey === "admin-a" ? "admin-b" : "admin-a";
  const selfReview = await request("POST", `/admin/appeals/${appeal.id}/assignment`, people[makerKey]!, { expected_version: 1, reviewer_user_id: afterDecision.decisionById, reason: "Attempted self review." });
  assert.equal(selfReview.status, 409);
  const invalidReviewer = await request("POST", `/admin/appeals/${appeal.id}/assignment`, people["admin-a"], { expected_version: 1, reviewer_user_id: people["customer-a"]!.id, reason: "Attempted non-admin review." });
  assert.equal(invalidReviewer.status, 409);
  const inactiveReviewer = await request("POST", `/admin/appeals/${appeal.id}/assignment`, people["admin-a"], { expected_version: 1, reviewer_user_id: people["admin-inactive"]!.id, reason: "Attempted suspended admin review." });
  assert.equal(inactiveReviewer.status, 409);
  const validReviewer = people[independentKey]!;
  const assignmentCandidates = [validReviewer, people["admin-c"]!];
  const assignments = await Promise.all(assignmentCandidates.map((reviewer, index) => request("POST", `/admin/appeals/${appeal.id}/assignment`, people[index === 0 ? "admin-a" : "admin-b"]!, { expected_version: 1, reviewer_user_id: reviewer.id, reason: "Concurrent independent reviewer assignment." })));
  assert.deepEqual(assignments.map((response) => response.status).sort(), [200, 409]);
  const assigned = await prisma.disputeAppeal.findUniqueOrThrow({ where: { id: appeal.id } });
  const finalReviewer = [validReviewer, people["admin-c"]!].find((candidate) => candidate.id === assigned.assignedReviewerId)!;
  const resolutions = await Promise.all([0, 1].map(() => request("POST", `/admin/appeals/${appeal.id}/decision`, finalReviewer, { expected_version: 2, outcome: "UPHELD", permitted_next_action: afterDecision.decisionOutcome, reason: "Independent review upholds the decision." })));
  assert.deepEqual(resolutions.map((response) => response.status).sort(), [200, 409]);
  assert.equal(await prisma.disputeAppealEvent.count({ where: { appealId: appeal.id, eventType: "DECIDED" } }), 1);
});

test("parallel dispute submissions and appeals preserve one-per-booking and one-per-party limits", async () => {
  const row = await booking(people["customer-a"]!, people["seller-a"]!);
  const submissions = await Promise.all([0, 1].map(() => request("POST", `/me/bookings/${row.id}/disputes`, people["customer-a"], disputeBody())));
  assert.equal(submissions.filter((response) => response.status === 201).length, 1);
  assert.ok(submissions.every((response) => response.status === 201 || response.status === 409));
  const disputeResponse = submissions.find((response) => response.status === 201)!;
  const dispute = (await disputeResponse.json() as any).data;
  const decision = await request("POST", `/admin/disputes/${dispute.id}/decision`, people["admin-a"], { expected_version: dispute.version, outcome: "CONTINUE_BOOKING", reason: "Close dispute for appeal test.", permitted_next_action: "Continue booking." });
  assert.equal(decision.status, 200, await decision.text());
  const appeals = await Promise.all([0, 1].map(() => request("POST", `/disputes/${dispute.id}/appeals`, people["customer-a"], { reason: "Concurrent appeal submission fixture." })));
  assert.equal(appeals.filter((response) => response.status === 201).length, 1);
  assert.ok(appeals.every((response) => response.status === 201 || response.status === 409));
});

test("dispute and appeal HTTP lifecycle preserves the exact delivery-cycle remainder", async () => {
  const row = await booking(people["customer-b"]!, people["seller-b"]!);
  const cycleBefore = await prisma.deliveryCycle.findFirstOrThrow({ where: { bookingId: row.id, active: true } });
  const dispute = await openDispute(row.id, people["customer-b"]!);
  const paused = await prisma.deliveryCycle.findFirstOrThrow({ where: { id: cycleBefore.id }, include: { pauseIntervals: true } });
  assert.equal(paused.status, "REVIEW_PAUSED");
  assert.equal(paused.pauseIntervals.filter((interval) => interval.endedAt === null).length, 1);
  const decision = await request("POST", `/admin/disputes/${dispute.id}/decision`, people["admin-a"], { expected_version: dispute.version, outcome: "CONTINUE_BOOKING", reason: "Continue after dispute review.", permitted_next_action: "Continue booking." });
  assert.equal(decision.status, 200, await decision.text());
  const resumed = await prisma.deliveryCycle.findUniqueOrThrow({ where: { id: cycleBefore.id }, include: { pauseIntervals: true } });
  assert.equal(resumed.status, "REVIEW_ACTIVE");
  const firstOpen = paused.pauseIntervals.find((interval) => interval.endedAt === null)!;
  const firstClosed = resumed.pauseIntervals.find((interval) => interval.id === firstOpen.id)!;
  assert.ok(firstClosed.endedAt);
  const expectedRemainingAtResume = Math.max(0, cycleBefore.durationMs - (firstOpen.startedAt.getTime() - cycleBefore.deliveryAt.getTime()));
  assert.equal(resumed.deadlineAt!.getTime() - firstClosed.endedAt.getTime(), expectedRemainingAtResume);

  const appealResponse = await request("POST", `/disputes/${dispute.id}/appeals`, people["customer-b"], { reason: "Ask an independent reviewer to reconsider." });
  const appealText = await appealResponse.text();
  assert.equal(appealResponse.status, 201, appealText);
  const appeal = JSON.parse(appealText);
  const appealPaused = await prisma.deliveryCycle.findUniqueOrThrow({ where: { id: cycleBefore.id }, include: { pauseIntervals: true } });
  assert.equal(appealPaused.status, "REVIEW_PAUSED");
  assert.equal(appealPaused.pauseIntervals.filter((interval) => interval.endedAt === null).length, 1);
  const reviewer = people[String((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).decisionById) === people["admin-a"]!.id ? "admin-b" : "admin-a"]!;
  const assignment = await request("POST", `/admin/appeals/${appeal.data.id}/assignment`, people["admin-c"], { expected_version: 1, reviewer_user_id: reviewer.id, reason: "Independent reviewer for timer test." });
  assert.equal(assignment.status, 200, await assignment.text());
  const resolve = await request("POST", `/admin/appeals/${appeal.data.id}/decision`, reviewer, { expected_version: 2, outcome: "UPHELD", permitted_next_action: "CONTINUE_BOOKING", reason: "Uphold original decision." });
  assert.equal(resolve.status, 200, await resolve.text());
  const afterAppeal = await prisma.deliveryCycle.findUniqueOrThrow({ where: { id: cycleBefore.id }, include: { pauseIntervals: true } });
  assert.equal(afterAppeal.status, "REVIEW_ACTIVE");
  assert.equal(afterAppeal.pauseIntervals.filter((interval) => interval.endedAt === null).length, 0);
  const closedAppealPause = afterAppeal.pauseIntervals.find((interval) => interval.endedAt === null);
  assert.equal(closedAppealPause, undefined);
  const appealPause = afterAppeal.pauseIntervals.at(-1)!;
  assert.ok(appealPause.endedAt);
  const expectedRemainingAfterAppeal = Math.max(0, resumed.deadlineAt!.getTime() - appealPause.startedAt.getTime());
  assert.equal(afterAppeal.deadlineAt!.getTime() - appealPause.endedAt.getTime(), expectedRemainingAfterAppeal);
});

test("dispute return-to-revision authorization is consumed only after quota reservation", async () => {
  const row = await booking(people["customer-a"]!, people["seller-a"]!);
  const dispute = await openDispute(row.id, people["customer-a"]!);
  const decision = await request("POST", `/admin/disputes/${dispute.id}/decision`, people["admin-a"], { expected_version: dispute.version, outcome: "RETURN_TO_REVISION", reason: "Authorize a new revision request.", permitted_next_action: "Customer may request a new revision within existing policy." });
  assert.equal(decision.status, 200, await decision.text());
  const authorization = await prisma.disputeRevisionAuthorization.findFirstOrThrow({ where: { disputeId: dispute.id, status: "AVAILABLE" } });
  assert.equal(authorization.bookingId, row.id);
  const create = () => request("POST", `/me/bookings/${row.id}/revisions`, people["customer-a"], { request_text: "A new dispute-authorized revision request." });
  const results = await Promise.all([create(), create()]);
  assert.ok(results.every((response) => response.status === 200 || response.status === 201 || response.status === 409));
  assert.equal(results.filter((response) => response.status === 201).length, 1);
  assert.equal(results.filter((response) => response.status === 409).length, 0);
  const revisions = await prisma.revisionRequest.findMany({ where: { bookingId: row.id } });
  assert.equal(revisions.length, 1);
  const used = await prisma.disputeRevisionAuthorization.findUniqueOrThrow({ where: { id: authorization.id } });
  assert.equal(used.status, "USED");
  assert.equal(used.consumedRevisionId, revisions[0]!.id);
  const quota = await prisma.revisionQuotaLedger.findMany({ where: { bookingId: row.id } });
  assert.deepEqual(quota.map((item) => item.operation), ["RESERVE"]);
  assert.equal(quota[0]!.availableDelta, -1);
  assert.equal(quota[0]!.reservedDelta, 1);
  assert.equal(quota[0]!.consumedDelta, 0);

  const noQuotaBooking = await booking(people["customer-b"]!, people["seller-b"]!, false, 0);
  const noQuotaDispute = await openDispute(noQuotaBooking.id, people["customer-b"]!);
  const noQuotaDecision = await request("POST", `/admin/disputes/${noQuotaDispute.id}/decision`, people["admin-a"], { expected_version: noQuotaDispute.version, outcome: "RETURN_TO_REVISION", reason: "Authorize revision subject to existing quota.", permitted_next_action: "Customer may request revision only if quota remains." });
  assert.equal(noQuotaDecision.status, 200, await noQuotaDecision.text());
  const noQuotaAuthorization = await prisma.disputeRevisionAuthorization.findFirstOrThrow({ where: { disputeId: noQuotaDispute.id, status: "AVAILABLE" } });
  const rejected = await request("POST", `/me/bookings/${noQuotaBooking.id}/revisions`, people["customer-b"], { request_text: "Attempt revision without available quota." });
  assert.equal(rejected.status, 409);
  assert.equal(await prisma.revisionRequest.count({ where: { bookingId: noQuotaBooking.id } }), 0);
  const unchanged = await prisma.disputeRevisionAuthorization.findUniqueOrThrow({ where: { id: noQuotaAuthorization.id } });
  assert.equal(unchanged.status, "AVAILABLE");
  assert.equal(unchanged.consumedRevisionId, null);
  assert.equal(await prisma.revisionQuotaLedger.count({ where: { bookingId: noQuotaBooking.id } }), 0);
});

test("zero remaining time stays due and active appeal still blocks scheduler eligibility", async () => {
  const expiredDelivery = new Date(Date.now() - 72 * 60 * 60 * 1000 - 60_000);
  const row = await booking(people["customer-b"]!, people["seller-b"]!, false, 2, expiredDelivery);
  const dispute = await openDispute(row.id, people["customer-b"]!);
  const paused = await prisma.deliveryCycle.findFirstOrThrow({ where: { bookingId: row.id, active: true } });
  assert.equal(paused.status, "REVIEW_PAUSED");
  assert.equal(paused.remainingMs, 0);
  const decision = await request("POST", `/admin/disputes/${dispute.id}/decision`, people["admin-a"], { expected_version: dispute.version, outcome: "CONTINUE_BOOKING", reason: "Resolve dispute after review time elapsed.", permitted_next_action: "Continue the booking workflow." });
  assert.equal(decision.status, 200, await decision.text());
  const appealText = await (await request("POST", `/disputes/${dispute.id}/appeals`, people["customer-b"], { reason: "Appeal while preserving expired review time." })).text();
  const appeal = JSON.parse(appealText).data;
  const reviewer = people[String((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).decisionById) === people["admin-a"]!.id ? "admin-b" : "admin-a"]!;
  const assignment = await request("POST", `/admin/appeals/${appeal.id}/assignment`, people["admin-c"], { expected_version: 1, reviewer_user_id: reviewer.id, reason: "Assign independent reviewer." });
  assert.equal(assignment.status, 200, await assignment.text());
  const blocked = await prisma.$transaction((tx) => checkCompletionEligibility(tx, row.id, "SCHEDULER", new Date(Date.now() + 86_400_000)));
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.reason, "ACTIVE_BLOCKER");
  const resolution = await request("POST", `/admin/appeals/${appeal.id}/decision`, reviewer, { expected_version: 2, outcome: "UPHELD", permitted_next_action: "CONTINUE_BOOKING", reason: "Uphold the decision; review time has elapsed." });
  assert.equal(resolution.status, 200, await resolution.text());
  const after = await prisma.deliveryCycle.findFirstOrThrow({ where: { bookingId: row.id, active: true } });
  assert.equal(after.status, "REVIEW_ACTIVE");
  assert.ok(after.deadlineAt!.getTime() <= Date.now() + 1000);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: row.id } })).status, "DELIVERED");
});

test("clarification response is limited to its recipient and records server timestamps", async () => {
  const row = await booking(people["customer-a"]!, people["seller-a"]!);
  const dispute = await openDispute(row.id, people["customer-a"]!);
  const nonAdminCustomer = await request("POST", `/admin/disputes/${dispute.id}/clarifications`, people["customer-a"], { expected_version: dispute.version, recipient: "CUSTOMER", question: "Provide more details for this review." });
  assert.equal(nonAdminCustomer.status, 403);
  const nonAdminSeller = await request("POST", `/admin/disputes/${dispute.id}/clarifications`, people["seller-a"], { expected_version: dispute.version, recipient: "CUSTOMER", question: "Provide more details for this review." });
  assert.equal(nonAdminSeller.status, 403);
  const suspendedAdmin = await request("POST", `/admin/disputes/${dispute.id}/clarifications`, people["admin-inactive"], { expected_version: dispute.version, recipient: "CUSTOMER", question: "Provide more details for this review." });
  assert.equal(suspendedAdmin.status, 401);

  const requested = await request("POST", `/admin/disputes/${dispute.id}/clarifications`, people["admin-a"], { expected_version: dispute.version, recipient: "CUSTOMER", question: "Please provide the requested clarification details." });
  const requestedBody = await requested.text();
  assert.equal(requested.status, 201, requestedBody);
  const detail = JSON.parse(requestedBody).data;
  const clarification = detail.clarifications.at(-1);
  assert.ok(clarification);
  const requestedAt = new Date(clarification.requested_at);
  const responseDueAt = new Date(clarification.response_due_at);
  assert.equal(responseDueAt.getTime() - requestedAt.getTime(), 48 * 60 * 60 * 1000);
  const persisted = await prisma.disputeClarification.findUniqueOrThrow({ where: { id: clarification.id } });
  assert.equal(persisted.requestedAt.toISOString(), clarification.requested_at);
  assert.equal(persisted.responseDueAt.toISOString(), clarification.response_due_at);

  const foreignCustomer = await request("POST", `/disputes/${dispute.id}/clarifications/${clarification.id}/respond`, people["customer-b"], { expected_version: detail.version, response_text: "Unauthorized customer response." });
  assert.equal(foreignCustomer.status, 404);
  const wrongPartySeller = await request("POST", `/disputes/${dispute.id}/clarifications/${clarification.id}/respond`, people["seller-a"], { expected_version: detail.version, response_text: "Seller is not the requested recipient." });
  assert.equal(wrongPartySeller.status, 404);
  assert.equal(await prisma.disputeEvent.count({ where: { disputeId: dispute.id, eventType: "CLARIFICATION_RESPONDED", actorUserId: { in: [people["customer-b"]!.id, people["seller-a"]!.id] } } }), 0);

  const response = await request("POST", `/disputes/${dispute.id}/clarifications/${clarification.id}/respond`, people["customer-a"], { expected_version: detail.version, response_text: "Here are the requested clarification details." });
  const responseBody = await response.text();
  assert.equal(response.status, 200, responseBody);
  const respondedDetail = JSON.parse(responseBody).data;
  const responded = await prisma.disputeClarification.findUniqueOrThrow({ where: { id: clarification.id } });
  assert.equal(responded.status, "RESPONDED");
  assert.equal(responded.respondedById, people["customer-a"]!.id);
  assert.ok(responded.respondedAt);
  assert.ok(responded.respondedAt!.getTime() >= requestedAt.getTime());
  assert.ok(responded.respondedAt!.getTime() <= Date.now());
  assert.equal(await prisma.disputeEvent.count({ where: { disputeId: dispute.id, eventType: "CLARIFICATION_RESPONDED", actorUserId: people["customer-a"]!.id } }), 1);
  const duplicate = await request("POST", `/disputes/${dispute.id}/clarifications/${clarification.id}/respond`, people["customer-a"], { expected_version: detail.version + 1, response_text: "A second response must be rejected." });
  assert.equal(duplicate.status, 409);
  await assert.rejects(prisma.disputeClarification.update({ where: { id: clarification.id }, data: { question: "Mutation must be rejected by database guard." } }));

  const sellerRequest = await request("POST", `/admin/disputes/${dispute.id}/clarifications`, people["admin-a"], { expected_version: respondedDetail.version, recipient: "SELLER", question: "Seller, provide your clarification details." });
  const sellerRequestBody = await sellerRequest.text();
  assert.equal(sellerRequest.status, 201, sellerRequestBody);
  const sellerRequestDetail = JSON.parse(sellerRequestBody).data;
  const sellerClarification = sellerRequestDetail.clarifications.at(-1);
  const wrongCustomer = await request("POST", `/disputes/${dispute.id}/clarifications/${sellerClarification.id}/respond`, people["customer-a"], { expected_version: sellerRequestDetail.version, response_text: "Customer is not the requested recipient." });
  assert.equal(wrongCustomer.status, 404);
  const sellerResponse = await request("POST", `/disputes/${dispute.id}/clarifications/${sellerClarification.id}/respond`, people["seller-a"], { expected_version: sellerRequestDetail.version, response_text: "Here are the seller clarification details." });
  assert.equal(sellerResponse.status, 200, await sellerResponse.text());
  const sellerPersisted = await prisma.disputeClarification.findUniqueOrThrow({ where: { id: sellerClarification.id } });
  assert.equal(sellerPersisted.status, "RESPONDED");
  assert.equal(sellerPersisted.respondedById, people["seller-a"]!.id);
});

test("expired clarification remains unanswered and requires explicit admin action", async () => {
  const row = await booking(people["customer-b"]!, people["seller-b"]!);
  const dispute = await openDispute(row.id, people["customer-b"]!);
  const clarificationId = randomUUID();
  const oldRequestedAt = new Date(Date.now() - 49 * 60 * 60 * 1000);
  const expiredAt = new Date(oldRequestedAt.getTime() + 48 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({ where: { id: dispute.id }, data: { status: "WAITING_CUSTOMER", version: { increment: 1 } } });
    await tx.disputeClarification.create({ data: { id: clarificationId, disputeId: dispute.id, recipient: "CUSTOMER", recipientUserId: people["customer-b"]!.id, requestedById: people["admin-a"]!.id, question: "Expired fixture clarification request.", requestedAt: oldRequestedAt, responseDueAt: expiredAt } });
    await tx.disputeEvent.create({ data: { disputeId: dispute.id, actorUserId: people["admin-a"]!.id, eventType: "CLARIFICATION_REQUESTED", fromStatus: "OPEN", toStatus: "WAITING_CUSTOMER", reason: "Expired fixture clarification request.", payload: { clarification_id: clarificationId, response_due_at: expiredAt.toISOString() }, occurredAt: oldRequestedAt } });
  });
  const expired = await request("POST", `/disputes/${dispute.id}/clarifications/${clarificationId}/respond`, people["customer-b"], { expected_version: dispute.version + 1, response_text: "Late response must not decide the dispute." });
  assert.equal(expired.status, 409);
  assert.equal((await prisma.disputeClarification.findUniqueOrThrow({ where: { id: clarificationId } })).status, "PENDING");
  assert.equal(await prisma.disputeEvent.count({ where: { disputeId: dispute.id, eventType: "CLARIFICATION_RESPONDED" } }), 0);
});

test("evidence links are party-owned, admin report linking is role-protected, and history is append-only", async () => {
  const row = await booking(people["customer-a"]!, people["seller-a"]!);
  const dispute = await openDispute(row.id, people["customer-a"]!);
  const conversation = await prisma.conversation.create({ data: { id: randomUUID(), serviceId: row.serviceId, customerId: row.customerId, sellerId: row.sellerId } });
  const message = await prisma.message.create({ data: { id: randomUUID(), conversationId: conversation.id, senderId: people["customer-a"]!.id, body: "Message retained as linked dispute evidence." } });

  const foreignCustomerRead = await request("GET", `/me/disputes/${dispute.id}`, people["customer-b"]);
  assert.equal(foreignCustomerRead.status, 404);
  const foreignCustomerWrite = await request("POST", `/disputes/${dispute.id}/evidence/messages`, people["customer-b"], { message_id: message.id });
  assert.equal(foreignCustomerWrite.status, 404);
  const foreignSellerRead = await request("GET", `/seller/disputes/${dispute.id}`, people["seller-b"]);
  assert.equal(foreignSellerRead.status, 404);
  const foreignSellerWrite = await request("POST", `/disputes/${dispute.id}/evidence/messages`, people["seller-b"], { message_id: message.id });
  assert.equal(foreignSellerWrite.status, 404);
  const adminOnlyAsCustomer = await request("POST", `/admin/disputes/${dispute.id}/reports`, people["customer-a"], { report_id: randomUUID() });
  assert.equal(adminOnlyAsCustomer.status, 403);
  const adminOnlyAsSeller = await request("POST", `/admin/disputes/${dispute.id}/reports`, people["seller-a"], { report_id: randomUUID() });
  assert.equal(adminOnlyAsSeller.status, 403);

  assert.equal(await prisma.disputeEvidenceAccess.count({ where: { disputeId: dispute.id, viewerId: { in: [people["customer-b"]!.id, people["seller-b"]!.id] } } }), 0);
  assert.equal(await prisma.disputeMessageEvidence.count({ where: { disputeId: dispute.id } }), 0);
  assert.equal(await prisma.disputeEvent.count({ where: { disputeId: dispute.id, eventType: "MESSAGE_EVIDENCE_LINKED", actorUserId: { in: [people["customer-b"]!.id, people["seller-b"]!.id] } } }), 0);

  const linked = await request("POST", `/disputes/${dispute.id}/evidence/messages`, people["customer-a"], { message_id: message.id });
  const linkedBody = await linked.text();
  assert.equal(linked.status, 201, linkedBody);
  assert.equal(JSON.parse(linkedBody).data.related_messages[0].id, message.id);
  const authorizedDetail = await request("GET", `/me/disputes/${dispute.id}`, people["customer-a"]);
  assert.equal(authorizedDetail.status, 200);
  assert.equal(await prisma.disputeEvidenceAccess.count({ where: { disputeId: dispute.id, viewerId: people["customer-a"]!.id, accessType: "CASE_DETAIL" } }), 1);

  const report = await prisma.report.create({ data: { reporterId: people["customer-a"]!.id, targetType: "BOOKING", targetId: row.id, bookingId: row.id, reason: "A related booking report for dispute evidence." } });
  const adminLink = await request("POST", `/admin/disputes/${dispute.id}/reports`, people["admin-a"], { report_id: report.id });
  assert.equal(adminLink.status, 201, await adminLink.text());
  assert.equal(await prisma.disputeReportEvidence.count({ where: { disputeId: dispute.id, reportId: report.id } }), 1);
  const adminDetail = await request("GET", `/admin/disputes/${dispute.id}`, people["admin-a"]);
  assert.equal(adminDetail.status, 200);
  assert.equal(await prisma.disputeEvidenceAccess.count({ where: { disputeId: dispute.id, viewerId: people["admin-a"]!.id, accessType: "CASE_DETAIL" } }), 1);
  await assert.rejects(prisma.disputeMessageEvidence.delete({ where: { disputeId_messageId: { disputeId: dispute.id, messageId: message.id } } }));
  await assert.rejects(prisma.disputeReportEvidence.delete({ where: { disputeId_reportId: { disputeId: dispute.id, reportId: report.id } } }));
});

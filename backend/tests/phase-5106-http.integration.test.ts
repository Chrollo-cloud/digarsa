import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.DOTENV_CONFIG_PATH = `${process.cwd()}\\.phase-5106-env-must-not-exist`;
process.env.JWT_SECRET = `phase-5106-${randomUUID()}-test-secret-32-chars-minimum`;
delete process.env.PAYMENT_DEMO_MODE;

const directUrl = process.env.DIRECT_URL_CONCURRENCY_TEST;
assert.ok(directUrl, "DIRECT_URL_CONCURRENCY_TEST is required");
const parsedTarget = new URL(directUrl);
assert.equal(parsedTarget.hostname.toLowerCase(), "localhost");
assert.equal(parsedTarget.port || "5432", "5432");
assert.equal(decodeURIComponent(parsedTarget.pathname.replace(/^\//, "")), "digarsa_concurrency_test");
assert.equal(decodeURIComponent(parsedTarget.username), "digarsa_concurrency_test_user");
assert.equal(parsedTarget.searchParams.get("schema") || "public", "public");

const [{ default: app }, { prisma }, { priceBuyerTotal }] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/prisma.js"),
  import("../src/modules/payments/pricing-policy.js"),
]);

const fixtureTag = `phase5106-http-${randomUUID()}`;
const jwtSecret = process.env.JWT_SECRET!;
let server: ReturnType<typeof app.listen>;
let origin = "";
type Principal = { id: string; role: "USER"; token: string; sellerProfileId?: string };

async function principal(label: string, approvedSeller = false): Promise<Principal> {
  const userId = randomUUID();
  await prisma.user.create({ data: {
    id: userId,
    email: `${fixtureTag}-${label}@test.invalid`,
    passwordHash: "integration-fixture-no-login-password",
    name: `${fixtureTag} ${label}`,
    role: "USER",
  } });
  let sellerProfileId: string | undefined;
  if (approvedSeller) {
    const profile = await prisma.sellerProfile.create({ data: {
      id: randomUUID(), userId, displayName: `${fixtureTag} ${label}`, region: "integration-test", verificationStatus: "APPROVED",
    } });
    sellerProfileId = profile.id;
  }
  const token = jwt.sign({ sub: userId, role: "USER", tokenVersion: 0 }, jwtSecret, { algorithm: "HS256", expiresIn: "30m" });
  return { id: userId, role: "USER", token, sellerProfileId };
}

async function call(method: string, path: string, actor?: Principal, body?: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: any;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: json };
}

async function createAcceptedBooking(customer: Principal, seller: Principal, serviceId: string) {
  const draft = { requirements: "A test request with enough detail", description: "Disposable Phase 5.10.6 HTTP lifecycle fixture.", requested_date: null, location: null };
  const validation = await call("POST", `/api/v1/services/${serviceId}/booking-validation`, customer, draft);
  assert.equal(validation.status, 200, JSON.stringify(validation.body));
  const policy = validation.body.data.revision_policy;
  assert.equal(policy.free_revision_count, 2);
  const created = await call("POST", "/api/v1/bookings", customer, {
    ...draft, service_id: serviceId, confirmed: true,
    revision_policy_hash: policy.hash, revision_policy_acknowledged: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id as string;
  const accepted = await call("POST", `/api/v1/seller/bookings/${id}/accept`, seller, { expected_status: "Requested" });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  return { id, amount: created.body.data.buyer_total as number };
}

before(async () => {
  const identity = await prisma.$queryRaw<Array<{ database: string; role: string; schema: string; server_address: string; port: number; is_superuser: boolean }>>`
    SELECT current_database() AS database, current_user AS role, current_schema() AS schema,
      inet_server_addr()::text AS server_address, inet_server_port() AS port,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser`;
  assert.deepEqual(identity[0], {
    database: "digarsa_concurrency_test", role: "digarsa_concurrency_test_user", schema: "public",
    server_address: "::1/128", port: 5432, is_superuser: false,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test("Phase 5.10.6 app-only HTTP booking, simulation, additional-work, and financial-isolation lifecycle", async () => {
  const customer = await principal("customer");
  const otherCustomer = await principal("other-customer");
  const seller = await principal("seller", true);
  const otherSeller = await principal("other-seller", true);
  const category = await prisma.category.create({ data: { name: `${fixtureTag} category`, slug: `${fixtureTag}-category` } });
  const service = await prisma.service.create({ data: {
    id: randomUUID(), sellerId: seller.sellerProfileId!, categoryId: category.id,
    title: `${fixtureTag} sample service`, description: "Approved dummy service for local HTTP verification.", price: 1700,
    region: "integration-test", moderationStatus: "APPROVED", revisionFreeCount: 2,
    revisionRequestWindowHours: 48, revisionTerms: "Two included revisions for this test fixture.",
  } });

  const browse = await call("GET", "/api/v1/services");
  assert.equal(browse.status, 200);
  assert.ok(browse.body.data.some((item: any) => item.id === service.id), "approved dummy service appears in public catalog");
  assert.equal((await call("GET", `/api/v1/services/${service.id}`)).status, 200, "approved dummy service detail is public");
  assert.equal((await call("GET", "/api/v1/payments/demo/availability")).status, 401, "availability is authenticated");
  const unavailable = await call("GET", "/api/v1/payments/demo/availability", customer);
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.body.data.enabled, false, "demo payments default off");

  const booking = await createAcceptedBooking(customer, seller, service.id);
  const own = await call("GET", `/api/v1/me/bookings/${booking.id}`, customer);
  assert.equal(own.status, 200);
  assert.equal((await call("GET", `/api/v1/me/bookings/${booking.id}`, otherCustomer)).status, 404, "customer cannot read another customer's booking");
  const sellerList = await call("GET", "/api/v1/seller/bookings", seller);
  assert.equal(sellerList.status, 200);
  assert.ok(sellerList.body.data.some((item: any) => item.id === booking.id));
  assert.equal((await call("GET", `/api/v1/seller/bookings/${booking.id}`, otherSeller)).status, 404, "seller cannot read another seller's booking");
  const disabledPayment = await call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, customer, { amount: booking.amount, currency: "IDR" });
  assert.equal(disabledPayment.status, 404, "demo payment route fails closed while disabled");

  process.env.PAYMENT_DEMO_MODE = "true";
  process.env.NODE_ENV = "production";
  const productionAvailability = await call("GET", "/api/v1/payments/demo/availability", customer);
  assert.equal(productionAvailability.body.data.enabled, false, "production cannot enable demo mode");
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, customer, { amount: booking.amount, currency: "IDR" })).status, 404);
  process.env.NODE_ENV = "test";
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, customer, { amount: booking.amount - 1, currency: "IDR" })).status, 409, "wrong amount is rejected");
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, customer, { amount: booking.amount, currency: "USD" })).status, 409, "wrong currency is rejected");
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, otherCustomer, { amount: booking.amount, currency: "IDR" })).status, 404, "other customer cannot pay this booking");
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, seller, { amount: booking.amount, currency: "IDR" })).status, 404, "seller cannot pay for a customer");

  const basePayments = await Promise.all([
    call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, customer, { amount: booking.amount, currency: "IDR" }),
    call("POST", `/api/v1/me/bookings/${booking.id}/demo-payment`, customer, { amount: booking.amount, currency: "IDR", idempotency_key: "different-client-key" }),
  ]);
  assert.deepEqual(basePayments.map((item) => item.status).sort(), [200, 201]);
  assert.ok(basePayments.every((item) => item.body.data.status === "DEMO_PAID" && item.body.data.provenance === "DEMO_SIMULATION"));
  assert.equal(await prisma.payment.count({ where: { bookingId: booking.id } }), 1);
  assert.equal(await prisma.paymentTransaction.count({ where: { bookingId: booking.id } }), 1);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } });
  assert.equal(payment.status, "DEMO_PAID");
  assert.equal(payment.provenance, "DEMO_SIMULATION");
  assert.equal(payment.payoutStatus, "HELD");
  const baseTransaction = await prisma.paymentTransaction.findFirstOrThrow({ where: { bookingId: booking.id } });
  assert.equal(baseTransaction.provider, null);
  assert.equal(baseTransaction.providerReference, null);
  assert.equal(await prisma.providerEventInbox.count({ where: { paymentTransactionId: baseTransaction.id } }), 0);

  const revisionBefore = await prisma.revisionQuotaLedger.count({ where: { bookingId: booking.id } });
  const cycleBefore = await prisma.deliveryCycle.count({ where: { bookingId: booking.id } });
  const request = await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-requests`, customer, { description: "Please add one separate design item." });
  assert.equal(request.status, 201, JSON.stringify(request.body));
  const sellerRequests = await call("GET", `/api/v1/seller/bookings/${booking.id}/additional-revision-requests`, seller);
  assert.equal(sellerRequests.status, 200);
  assert.ok(sellerRequests.body.data.some((item: any) => item.id === request.body.data.id));
  const clarification = await call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-requests/${request.body.data.id}/clarifications`, seller, { message: "Please confirm the preferred color palette." });
  assert.equal(clarification.status, 200);
  const answer = await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-requests/${request.body.data.id}/clarifications/respond`, customer, { message: "Use the existing project palette." });
  assert.equal(answer.status, 200);
  const offer = await call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-requests/${request.body.data.id}/offers`, seller, {
    scope: "Create one supplementary design asset.", terms: "One delivery note and one customer review.", seller_price: 1000, estimated_duration_hours: 12,
  });
  assert.equal(offer.status, 201, JSON.stringify(offer.body));
  const savedOffer = await prisma.additionalRevisionOfferVersion.findUniqueOrThrow({ where: { id: offer.body.data.id } });
  const offerLifetime = savedOffer.expiresAt.getTime() - savedOffer.createdAt.getTime();
  assert.ok(offerLifetime <= 48 * 60 * 60 * 1000 && offerLifetime >= 48 * 60 * 60 * 1000 - 5_000, `offer validity should be 48 hours (allowing database timestamp latency), got ${offerLifetime}ms`);
  await assert.rejects(prisma.additionalRevisionOfferVersion.update({ where: { id: savedOffer.id }, data: { scope: "Mutated terms that must be rejected." } }));
  assert.equal((await prisma.additionalRevisionOfferVersion.findUniqueOrThrow({ where: { id: savedOffer.id } })).scope, savedOffer.scope);

  const acceptances = await Promise.all([
    call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-requests/${request.body.data.id}/offers/${savedOffer.id}/accept`, customer, {}),
    call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-requests/${request.body.data.id}/offers/${savedOffer.id}/accept`, customer, {}),
  ]);
  assert.equal(acceptances.filter((item) => item.status === 201).length, 1);
  assert.ok(acceptances.every((item) => [201, 404, 409].includes(item.status)));
  const agreement = await prisma.additionalRevisionAgreement.findUniqueOrThrow({ where: { requestId: request.body.data.id } });
  assert.equal(agreement.status, "AWAITING_PAYMENT");
  delete process.env.PAYMENT_DEMO_MODE;
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-payment`, customer, { amount: agreement.buyerTotal, currency: "IDR" })).status, 404, "agreement payment also fails closed when disabled");
  process.env.PAYMENT_DEMO_MODE = "true";
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-payment`, customer, { amount: agreement.buyerTotal - 1, currency: "IDR" })).status, 409);
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-payment`, otherCustomer, { amount: agreement.buyerTotal, currency: "IDR" })).status, 404);
  const agreementCancellation = await prisma.cancellationRequest.create({ data: {
    bookingId: booking.id, requesterId: customer.id, reason: `${fixtureTag} block add-on demo payment`, evidencePath: `${fixtureTag}/agreement-evidence.txt`,
  } });
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-payment`, customer, { amount: agreement.buyerTotal, currency: "IDR" })).status, 409, "pending cancellation blocks additional-work demo payment");
  await prisma.cancellationRequest.update({ where: { id: agreementCancellation.id }, data: { status: "REJECTED" } });
  const agreementPayments = await Promise.all([
    call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-payment`, customer, { amount: agreement.buyerTotal, currency: "IDR" }),
    call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-payment`, customer, { amount: agreement.buyerTotal, currency: "IDR", idempotency_key: "other-client-key" }),
  ]);
  assert.deepEqual(agreementPayments.map((item) => item.status).sort(), [200, 201]);
  assert.ok(agreementPayments.every((item) => item.body.data.provenance === "DEMO_SIMULATION"));
  assert.equal(await prisma.paymentTransaction.count({ where: { additionalAgreementId: agreement.id } }), 1);
  assert.equal(await prisma.additionalRevisionAgreement.count({ where: { bookingId: booking.id, status: "DEMO_FUNDED" } }), 1);

  const transaction = await prisma.paymentTransaction.findFirstOrThrow({ where: { additionalAgreementId: agreement.id } });
  const now = new Date();
  await assert.rejects(prisma.$transaction((tx) => tx.sellerPayout.create({ data: { paymentTransactionId: transaction.id, idempotencyKey: `${fixtureTag}:payout`, amount: agreement.sellerPrice } })));
  await assert.rejects(prisma.$transaction((tx) => tx.paymentRefund.create({ data: { paymentTransactionId: transaction.id, decisionReference: `${fixtureTag}:refund`, idempotencyKey: `${fixtureTag}:refund`, sellerPriceRefund: 100, adminFeeRefund: 5, amount: 105 } })));
  await assert.rejects(prisma.$transaction((tx) => tx.financialLedgerEntry.create({ data: { sourceType: "TEST", sourceId: fixtureTag, entryType: "DEMO_TEST", amount: 100, paymentTransactionId: transaction.id } })));
  assert.equal(await prisma.sellerPayout.count({ where: { paymentTransactionId: transaction.id } }), 0);
  assert.equal(await prisma.paymentRefund.count({ where: { paymentTransactionId: transaction.id } }), 0);
  assert.equal(await prisma.financialLedgerEntry.count({ where: { paymentTransactionId: transaction.id } }), 0);

  const workCancellation = await prisma.cancellationRequest.create({ data: {
    bookingId: booking.id, requesterId: customer.id, reason: `${fixtureTag} block demo work`, evidencePath: `${fixtureTag}/work-evidence.txt`,
  } });
  assert.equal((await call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-start`, seller, {})).status, 409, "pending cancellation blocks demo work start");
  await prisma.cancellationRequest.update({ where: { id: workCancellation.id }, data: { status: "REJECTED" } });
  const starts = await Promise.all([
    call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-start`, seller, {}),
    call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-start`, seller, {}),
  ]);
  assert.deepEqual(starts.map((item) => item.status).sort(), [200, 409]);
  assert.equal((await call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-deliver`, otherSeller, { delivery_note: "Wrong seller delivery note." })).status, 409);
  const deliveries = await Promise.all([
    call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-deliver`, seller, { delivery_note: "The separate design asset is delivered." }),
    call("POST", `/api/v1/seller/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-deliver`, seller, { delivery_note: "The separate design asset is delivered." }),
  ]);
  assert.deepEqual(deliveries.map((item) => item.status).sort(), [200, 409]);
  assert.equal((await prisma.additionalRevisionAgreement.findUniqueOrThrow({ where: { id: agreement.id } })).status, "DEMO_IN_REVIEW");
  await prisma.additionalRevisionAgreement.update({ where: { id: agreement.id }, data: { reviewDeadlineAt: new Date(now.getTime() - 1_000) } });
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-complete`, customer, {})).status, 409, "completion after review deadline is blocked");
  await prisma.additionalRevisionAgreement.update({ where: { id: agreement.id }, data: { reviewDeadlineAt: new Date(Date.now() + 60_000) } });
  assert.equal((await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-complete`, otherCustomer, {})).status, 409, "another customer cannot approve delivery");
  const completed = await call("POST", `/api/v1/me/bookings/${booking.id}/additional-revision-agreements/${agreement.id}/demo-complete`, customer, {});
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.data.status, "DEMO_COMPLETED");
  assert.equal(completed.body.data.financial_entitlement_created, false);
  assert.equal(await prisma.revisionQuotaLedger.count({ where: { bookingId: booking.id } }), revisionBefore, "paid additional work does not consume free revision quota");
  assert.equal(await prisma.deliveryCycle.count({ where: { bookingId: booking.id } }), cycleBefore, "paid additional work does not create original delivery cycles");

  const baseDelivery = await call("POST", `/api/v1/seller/bookings/${booking.id}/deliver`, seller, { expected_status: "Paid" });
  assert.equal(baseDelivery.status, 200, JSON.stringify(baseDelivery.body));
  const baseCompletion = await call("POST", `/api/v1/me/bookings/${booking.id}/complete`, customer, { expected_status: "Delivered" });
  assert.equal(baseCompletion.status, 200, JSON.stringify(baseCompletion.body));
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })).payoutStatus, "HELD", "booking completion must not make a demo payment payout eligible");
  assert.equal(await prisma.deliveryCycle.count({ where: { bookingId: booking.id } }), cycleBefore + 1, "only the original delivery creates the original booking cycle");

  const secondBooking = await createAcceptedBooking(customer, seller, service.id);
  const pendingCancellation = await prisma.cancellationRequest.create({ data: {
    bookingId: secondBooking.id, requesterId: customer.id, reason: `${fixtureTag} pending cancellation test`, evidencePath: `${fixtureTag}/evidence.txt`,
  } });
  assert.equal((await call("POST", `/api/v1/me/bookings/${secondBooking.id}/demo-payment`, customer, { amount: secondBooking.amount, currency: "IDR" })).status, 409, "pending cancellation blocks first demo payment");
  assert.equal(await prisma.payment.count({ where: { bookingId: secondBooking.id } }), 0);
  await prisma.cancellationRequest.update({ where: { id: pendingCancellation.id }, data: { status: "REJECTED" } });
  const secondPayment = await call("POST", `/api/v1/me/bookings/${secondBooking.id}/demo-payment`, customer, { amount: secondBooking.amount, currency: "IDR" });
  assert.ok([200, 201].includes(secondPayment.status));
  const expiringRequest = await call("POST", `/api/v1/me/bookings/${secondBooking.id}/additional-revision-requests`, customer, { description: "Please add one item to exercise offer expiry." });
  assert.equal(expiringRequest.status, 201);
  const expiredPrice = priceBuyerTotal(1000);
  const expiredOffer = await prisma.additionalRevisionOfferVersion.create({ data: {
    requestId: expiringRequest.body.data.id, version: 1, scope: "An expired offer for an isolated test.", terms: "Expired offer should not be accepted.",
    sellerPrice: expiredPrice.sellerPrice, adminFee: expiredPrice.adminFee, buyerTotal: expiredPrice.buyerTotal,
    pricingPolicyVersion: expiredPrice.pricingPolicyVersion, estimatedDurationHours: 1, expiresAt: new Date(Date.now() - 1000),
  } });
  await prisma.additionalRevisionRequest.update({ where: { id: expiringRequest.body.data.id }, data: { status: "OFFERED" } });
  const expiredAcceptance = await call("POST", `/api/v1/me/bookings/${secondBooking.id}/additional-revision-requests/${expiringRequest.body.data.id}/offers/${expiredOffer.id}/accept`, customer, {});
  assert.equal(expiredAcceptance.status, 410, "expired offer acceptance is rejected");
  assert.equal(await prisma.additionalRevisionAgreement.count({ where: { requestId: expiringRequest.body.data.id } }), 0);

  const disputedBooking = await createAcceptedBooking(customer, seller, service.id);
  await prisma.dispute.create({ data: {
    bookingId: disputedBooking.id, createdById: customer.id, category: "OTHER",
    description: `${fixtureTag} active dispute blocks demo payment`, evidenceRetainUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  } });
  assert.equal((await call("POST", `/api/v1/me/bookings/${disputedBooking.id}/demo-payment`, customer, { amount: disputedBooking.amount, currency: "IDR" })).status, 409, "active dispute blocks first demo payment");
  assert.equal(await prisma.payment.count({ where: { bookingId: disputedBooking.id } }), 0);

  const finalPayment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } });
  assert.equal(finalPayment.payoutStatus, "HELD", "demo payment never becomes payout eligible");
  // Fixtures carry a unique phase tag. Append-only lifecycle history is retained in this disposable test DB;
  // no existing or untagged records are removed, and no trigger or migration protection is bypassed.
});

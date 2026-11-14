import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, RequestHandler, Response } from "express";
import type { Prisma } from "../src/generated/prisma/client.js";
import { HttpError } from "../src/lib/http.js";
import { authenticate } from "../src/middleware/auth.middleware.js";
import type { PublicServiceRow } from "../src/modules/catalog/catalog.service.js";
import catalogRoutes from "../src/modules/catalog/catalog.routes.js";
import { addBookableCartItem, deleteCartItemRow, savedServiceAvailable } from "../src/modules/catalog/saved-items.service.js";

type TestTx = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  service: { findFirst: (args: unknown) => Promise<{ id: string; status: "OPEN" | "FULL_BOOK" } | null> };
  cartItem: {
    upsert: (args: { where: { userId_serviceId: { userId: string; serviceId: string } }; create: { userId: string; serviceId: string }; update: object }) => Promise<{ userId: string; serviceId: string }>;
    deleteMany: (args: { where: { userId: string; serviceId: string } }) => Promise<{ count: number }>;
  };
};

function createFakeTx(initialStatus: "OPEN" | "FULL_BOOK" | null = "OPEN") {
  let status = initialStatus;
  const rows = new Map<string, { userId: string; serviceId: string }>();
  const events: string[] = [];
  let upsertCalls = 0;
  const tx: TestTx = {
    async $queryRaw(_strings, ..._values) { events.push("lock-service"); return []; },
    service: {
      async findFirst() {
        events.push("check-public-service");
        return status ? { id: "service-1", status } : null;
      },
    },
    cartItem: {
      async upsert({ where, create }) {
        events.push("upsert-cart");
        upsertCalls += 1;
        const key = `${where.userId_serviceId.userId}:${where.userId_serviceId.serviceId}`;
        if (!rows.has(key)) rows.set(key, create);
        return rows.get(key)!;
      },
      async deleteMany({ where }) {
        events.push("delete-cart");
        const key = `${where.userId}:${where.serviceId}`;
        return { count: rows.delete(key) ? 1 : 0 };
      },
    },
  };
  return {
    tx,
    rows,
    events,
    get upsertCalls() { return upsertCalls; },
    setStatus(next: "OPEN" | "FULL_BOOK" | null) { status = next; },
  };
}

const serviceRow = (status: "OPEN" | "FULL_BOOK", visible = true) => ({
  status,
  active: visible,
  isHidden: !visible,
  moderationStatus: visible ? "APPROVED" : "REJECTED",
  category: { isActive: visible },
  seller: { verificationStatus: visible ? "APPROVED" : "PENDING", user: { accountStatus: "ACTIVE" } },
}) as unknown as PublicServiceRow;

test("OPEN and publicly visible service is added while holding the service row lock", async () => {
  const fake = createFakeTx("OPEN");
  await addBookableCartItem(fake.tx as unknown as Prisma.TransactionClient, "buyer-1", "service-1");
  assert.deepEqual(fake.events, ["lock-service", "check-public-service", "upsert-cart"]);
  assert.equal(fake.rows.size, 1);
});

test("FULL_BOOK service is rejected with the booking API's 409 contract", async () => {
  const fake = createFakeTx("FULL_BOOK");
  await assert.rejects(
    addBookableCartItem(fake.tx as unknown as Prisma.TransactionClient, "buyer-1", "service-1"),
    (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === "SERVICE_NOT_BOOKABLE",
  );
  assert.deepEqual(fake.events, ["lock-service", "check-public-service"]);
  assert.equal(fake.rows.size, 0);
});

test("non-public service is rejected and never reaches cart upsert", async () => {
  const fake = createFakeTx(null);
  await assert.rejects(
    addBookableCartItem(fake.tx as unknown as Prisma.TransactionClient, "buyer-1", "hidden-service"),
    (error: unknown) => error instanceof HttpError && error.status === 404 && error.code === "SERVICE_NOT_FOUND",
  );
  assert.equal(fake.upsertCalls, 0);
});

test("missing service is rejected with SERVICE_NOT_FOUND", async () => {
  const fake = createFakeTx(null);
  await assert.rejects(
    addBookableCartItem(fake.tx as unknown as Prisma.TransactionClient, "buyer-1", "missing-service"),
    (error: unknown) => error instanceof HttpError && error.status === 404 && error.code === "SERVICE_NOT_FOUND",
  );
});

test("the registered cart add route applies authentication and rejects a missing bearer token", async () => {
  type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  const routeLayers = (catalogRoutes as unknown as { stack: RouteLayer[] }).stack;
  const route = routeLayers.find((layer) => layer.route?.path === "/me/cart/:service_id" && layer.route.methods.put)?.route;
  assert.ok(route, "PUT /me/cart/:service_id is registered");
  assert.equal(route.stack[0]?.handle, authenticate, "authenticate is the first route middleware");

  const req = { headers: {} } as Request;
  let status = 0;
  let body: unknown;
  const res = {
    locals: {},
    status(code: number) { status = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  let calledNext = false;
  await route.stack[0]!.handle(req, res, () => { calledNext = true; });
  assert.equal(status, 401);
  assert.deepEqual(body, { error: { code: "UNAUTHORIZED", message: "Silakan login terlebih dahulu." } });
  assert.equal(calledNext, false);
});

test("repeated OPEN service add uses the unique-key upsert without duplicate rows", async () => {
  const fake = createFakeTx("OPEN");
  const tx = fake.tx as unknown as Prisma.TransactionClient;
  await addBookableCartItem(tx, "buyer-1", "service-1");
  await addBookableCartItem(tx, "buyer-1", "service-1");
  assert.equal(fake.upsertCalls, 2);
  assert.equal(fake.rows.size, 1);
});

test("an OPEN-to-FULL_BOOK transition between add requests blocks the later request", async () => {
  const fake = createFakeTx("OPEN");
  const tx = fake.tx as unknown as Prisma.TransactionClient;
  await addBookableCartItem(tx, "buyer-1", "service-1");
  fake.setStatus("FULL_BOOK");
  await assert.rejects(addBookableCartItem(tx, "buyer-1", "service-1"), (error: unknown) => error instanceof HttpError && error.code === "SERVICE_NOT_BOOKABLE");
  assert.equal(fake.rows.size, 1);
  assert.equal(fake.upsertCalls, 1);
});

test("an existing FULL_BOOK cart row remains stored but is reported unavailable", () => {
  const fake = createFakeTx("FULL_BOOK");
  fake.rows.set("buyer-1:service-1", { userId: "buyer-1", serviceId: "service-1" });
  assert.equal(savedServiceAvailable(serviceRow("FULL_BOOK")), false);
  assert.equal(fake.rows.size, 1);
});

test("an unavailable existing cart row can still be removed", async () => {
  const fake = createFakeTx("FULL_BOOK");
  fake.rows.set("buyer-1:service-1", { userId: "buyer-1", serviceId: "service-1" });
  await deleteCartItemRow(fake.tx as unknown as Prisma.TransactionClient, "buyer-1", "service-1");
  assert.equal(fake.rows.size, 0);
  assert.deepEqual(fake.events, ["delete-cart"]);
});


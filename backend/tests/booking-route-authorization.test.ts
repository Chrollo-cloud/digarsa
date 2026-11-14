import assert from "node:assert/strict";
import test from "node:test";

const testUrl = process.env.DIRECT_URL_CONCURRENCY_TEST;
assert.ok(testUrl, "DIRECT_URL_CONCURRENCY_TEST must be provided by the execution process");
const parsedUrl = new URL(testUrl);
assert.equal(parsedUrl.hostname, "localhost");
assert.equal(parsedUrl.port || "5432", "5432");
assert.equal(decodeURIComponent(parsedUrl.pathname.replace(/^\//, "")), "digarsa_concurrency_test");
assert.equal(decodeURIComponent(parsedUrl.username), "digarsa_concurrency_test_user");
assert.equal(parsedUrl.searchParams.get("schema") || "public", "public");

// Route modules initialize the Prisma adapter at import time. Point it at the
// already approved disposable target; these tests exercise middleware only and
// deliberately make no database requests.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = testUrl;
const [{ default: bookingRoutes }, { authenticate, requireRole }, { requireApprovedSeller }] = await Promise.all([
  import("../src/modules/bookings/booking.routes.ts"),
  import("../src/middleware/auth.middleware.ts"),
  import("../src/modules/services/service.middleware.ts"),
]);
if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = originalDatabaseUrl;

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: (...args: any[]) => unknown }[] };
};

function route(method: string, path: string) {
  const layer = (bookingRoutes as unknown as { stack: RouteLayer[] }).stack.find((item) =>
    item.route?.path === path && item.route.methods[method]);
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} is registered`);
  return layer.route;
}

function response(locals: Record<string, unknown>) {
  let statusCode = 0;
  let body: unknown;
  return {
    res: {
      locals,
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

test("customer revision route requires authentication and USER role", async () => {
  const target = route("get", "/me/bookings/:booking_id/revisions");
  assert.equal(target.stack[0]?.handle, authenticate);
  assert.ok(target.stack[1]?.handle, "USER role guard is registered after authentication");

  const missing = response({});
  let advanced = false;
  await target.stack[0]!.handle({ headers: {} }, missing.res, () => { advanced = true; });
  assert.equal(missing.statusCode, 401);
  assert.equal(advanced, false);

  const wrongRole = response({ auth: { userId: "route-test", role: "ADMIN", tokenVersion: 0 } });
  advanced = false;
  await target.stack[1]!.handle({}, wrongRole.res, () => { advanced = true; });
  assert.equal(wrongRole.statusCode, 403);
  assert.equal(advanced, false);
});

test("admin assistance routes require authentication and reject a non-admin role", async () => {
  const target = route("get", "/admin/revision-assistance");
  assert.equal(target.stack[0]?.handle, authenticate);
  assert.ok(target.stack[1]?.handle, "ADMIN role guard is registered after authentication");

  const missing = response({});
  let advanced = false;
  await target.stack[0]!.handle({ headers: {} }, missing.res, () => { advanced = true; });
  assert.equal(missing.statusCode, 401);
  assert.equal(advanced, false);

  const wrongRole = response({ auth: { userId: "route-test", role: "USER", tokenVersion: 0 } });
  advanced = false;
  await target.stack[1]!.handle({}, wrongRole.res, () => { advanced = true; });
  assert.equal(wrongRole.statusCode, 403);
  assert.equal(advanced, false);
});

test("seller revision routes use the approved-seller authorization gate", () => {
  const target = route("get", "/seller/bookings/:booking_id/revisions");
  assert.equal(target.stack[0]?.handle, authenticate);
  assert.equal(target.stack[1]?.handle, requireApprovedSeller);
});


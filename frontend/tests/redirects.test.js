import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "../src/features/account/redirects.js";
import {
  bookingLifecycle,
  bookingStatusDescription,
} from "../src/features/customer/bookingLifecycle.js";

test("valid nested seller/admin routes preserve pathname, query, and hash", () => {
  for (const path of [
    "/seller-dashboard",
    "/seller-dashboard/",
    "/seller-dashboard/orders?status=Requested#list",
    "/seller-dashboard/orders/booking-a1?view=brief#details",
    "/seller-dashboard/services",
    "/seller-dashboard/services/new",
    "/seller-dashboard/services/service-a1/edit?tab=media#photo",
    "/seller-dashboard/earnings",
    "/seller-dashboard/profile",
    "/admin",
    "/admin/accounts?filter=seller#accounts",
    "/admin/moderation",
    "/admin/orders?status=Accepted#orders",
    "/profile",
    "/settings",
    "/favorites",
    "/cart",
    "/booking/identity",
    "/orders/booking-a1",
    "/become-a-creator",
    "/marketplace?category=Fotografi%20%26%20Film#results",
    "/",
  ])
    assert.equal(safeReturnTo(path), path, path);
});

test("unsafe and malformed paths cannot be normalized into valid destinations", () => {
  for (const path of [
    null,
    "",
    "https://evil.example/admin/orders",
    "//evil.example",
    "///admin",
    "/\\evil.example/admin",
    "javascript:alert(1)",
    "/admin/../admin/orders",
    "/seller-dashboard/./orders",
    "/seller-dashboard//orders",
    "/seller-dashboard/orders//",
    "/seller-dashboard/%2e%2e/admin",
    "/%2F%2Fevil.example",
    "/admin%2forders",
    "/admin/accounts?x=%0aevil",
    "/admin/orders#%5cevil",
    "/admin?x=%ZZ",
    "/admin/orders?x=%E0%A4%A",
    "/admin/orders\u0000",
    "/admin/orders\n",
    "/seller-dashboard/services/service-a1/delete",
    "/admin/unknown",
    "/login?returnTo=/admin",
    "/register",
  ])
    assert.equal(safeReturnTo(path), "/", String(path));
});

test("return syntax does not encode or assign permissions", () => {
  // Destination access is independently enforced by the unchanged route guards and stores.
  assert.equal(safeReturnTo("/admin/orders"), "/admin/orders");
  assert.equal(
    safeReturnTo("/seller-dashboard/orders"),
    "/seller-dashboard/orders",
  );
});

test("status copy keeps acceptance distinct from payment and completion", () => {
  assert.deepEqual(bookingLifecycle, [
    "Requested",
    "Accepted",
    "Paid",
    "Completed",
  ]);
  assert.match(bookingStatusDescription("Accepted"), /Belum dibayar/);
  assert.match(bookingStatusDescription("Accepted"), /status tetap diterima/);
  assert.match(bookingStatusDescription("Paid"), /Hanya kreator pemilik/);
  assert.match(bookingStatusDescription("Declined"), /ditolak/);
  assert.match(bookingStatusDescription("Cancelled"), /dibatalkan/);
});

test("normal login and registration default to the homepage without auth loops", () => {
  for (const path of [
    undefined,
    null,
    "",
    "/login",
    "/register?returnTo=/login",
    "https://evil.example",
    "/%252f%252fevil.example",
  ])
    assert.equal(safeReturnTo(path), "/");
  for (const path of [
    "/booking/service-real?step=brief#form",
    "/become-a-creator",
    "/seller-dashboard/availability",
    "/seller-dashboard/messages/conversation-1?tab=brief#latest",
    "/seller-dashboard/notifications",
    "/admin/orders?status=Requested#list",
  ])
    assert.equal(safeReturnTo(path), path);
});

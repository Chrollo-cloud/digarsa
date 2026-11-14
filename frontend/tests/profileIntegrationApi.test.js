import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getCurrentAccount, updateCurrentAccount } from "../src/features/account/authApi.js";
import { API_BASE_URL } from "../src/lib/apiClient.js";
import { applySellerProfile, canSubmitActivation, canWithdrawActivation, createPortfolioItem, deletePortfolioItem, getMyActivationStatus, getMySellerProfile, listMyServices, listMyPortfolio, submitActivationReview, updateMySellerProfile, withdrawActivationReview } from "../src/features/sellerPreparation/sellerPreparationApi.js";

const oldFetch = globalThis.fetch;
const oldWindow = globalThis.window;
const token = "test-session";
beforeEach(() => { globalThis.window = { sessionStorage: { getItem: () => token } }; });
afterEach(() => {
  globalThis.fetch = oldFetch;
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
});

function response(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }

test("customer profile reads and patches authenticated server data", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return response({ data: { user: { id: "user-1", name: "Ayu", phone: "0812345678", role: "USER" } } });
  };
  assert.equal((await getCurrentAccount()).name, "Ayu");
  const account = await updateCurrentAccount({ name: "Ayu Putri", gender: "Perempuan" });
  assert.equal(account.name, "Ayu");
  assert.equal(requests[0].url, `${API_BASE_URL}/api/auth/me`);
  assert.equal(requests[0].options.headers.get("Authorization"), `Bearer ${token}`);
  assert.equal(requests[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[1].options.body), { name: "Ayu Putri", gender: "Perempuan" });
});

test("seller preparation adapters use verified paths and normalize responses", async () => {
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith("/api/sellers/apply")) return response({ data: { seller: { id: "seller-1", name: "Studio" } } });
    if (url.endsWith("/api/sellers/me/activation-review") && options.method === "POST") return response({ data: { id: "review-1", status: "PENDING" } });
    if (url.endsWith("/api/sellers/me/activation-review") && options.method === "DELETE") return response({ data: { id: "review-1", status: "WITHDRAWN" } });
    if (url.endsWith("/api/sellers/me/activation-review")) return response({ data: { status: "REJECTED", review: { id: "review-1", status: "REJECTED", rejection_reason: "Please update your portfolio." } } });
    if (url.endsWith("/api/sellers/me/portfolio") && options.method === "POST") return response({ data: { id: "work-1", image_url: "https://img.example/work.jpg" } });
    if (url.endsWith("/api/sellers/me/portfolio/work-1")) return response({ data: { id: "work-1", deleted: true } });
    if (url.endsWith("/api/sellers/me/portfolio")) return response({ data: [{ id: "work-1", image_url: "https://img.example/work.jpg" }] });
    if (url.endsWith("/api/services/mine")) return response({ data: [{ id: "svc-1", title: "Logo", price: 120000, active: true, moderationStatus: "PENDING" }] });
    if (url.endsWith("/api/sellers/me") && options.method === "PATCH") return response({ data: { id: "seller-1", name: "Updated Studio" } });
    return response({ data: { id: "seller-1", name: "Studio" } });
  };
  assert.equal((await applySellerProfile({ name: "Studio" })).id, "seller-1");
  assert.equal((await getMySellerProfile()).name, "Studio");
  assert.equal((await updateMySellerProfile({ name: "Updated Studio" })).name, "Updated Studio");
  const activation = await getMyActivationStatus();
  assert.equal(activation.review.rejectionReason, "Please update your portfolio.");
  assert.equal((await submitActivationReview()).status, "PENDING");
  assert.equal((await withdrawActivationReview()).status, "WITHDRAWN");
  assert.equal((await listMyPortfolio())[0].id, "work-1");
  assert.equal((await createPortfolioItem({ title: "Work", imageUrl: "https://img.example/work.jpg" })).id, "work-1");
  await deletePortfolioItem("work-1");
  assert.equal((await listMyServices())[0].moderationStatus, "PENDING");
  assert.deepEqual(JSON.parse(seen.find((call) => call.options.method === "POST" && call.url.endsWith("activation-review")).options.body), {});
  assert.equal(seen.every((call) => call.options.headers.get("Authorization") === `Bearer ${token}`), true);
});

test("activation actions are limited to backend-supported statuses", () => {
  assert.equal(canSubmitActivation("NOT_SUBMITTED"), true);
  assert.equal(canSubmitActivation("REJECTED"), true);
  assert.equal(canSubmitActivation("WITHDRAWN"), true);
  assert.equal(canSubmitActivation("PENDING"), false);
  assert.equal(canSubmitActivation("APPROVED"), false);
  assert.equal(canWithdrawActivation("PENDING"), true);
  assert.equal(canWithdrawActivation("APPROVED"), false);
});

test("401 and validation errors retain backend codes and details", async () => {
  globalThis.fetch = async () => response({ error: { code: "UNAUTHORIZED", message: "Expired session" } }, 401);
  await assert.rejects(updateCurrentAccount({ name: "Ayu" }), (error) => error.status === 401 && error.code === "UNAUTHORIZED");
  globalThis.fetch = async () => response({ error: { code: "VALIDATION_ERROR", message: "Invalid profile", details: [{ field: "name", message: "Too short" }] } }, 422);
  await assert.rejects(updateCurrentAccount({ name: "A" }), (error) => error.status === 422 && error.details[0].field === "name");
});


import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import { publicUrl } from "../src/utils/publicUrl.js";
import { createPublicLocationDraft, publicLocationDraftReducer as reduce } from "../src/features/location/publicLocationDraft.js";
import { publicLocationFromForm, parseCoordinates, publicLocation } from "../src/features/location/locationModel.js";

let server, PortfolioLink, Footer, Avatar, PublicLocationFields;
before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  [PortfolioLink, Footer, Avatar, PublicLocationFields] = await Promise.all([
    "/src/components/marketplace/PortfolioLink.jsx", "/src/components/layout/Footer.jsx",
    "/src/features/profile/Avatar.jsx", "/src/features/location/PublicLocationFields.jsx",
  ].map(async (path) => (await server.ssrLoadModule(path)).default));
});
after(async () => { await server?.close(); });
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const point = { lat: -5.14, lng: 119.42 }; // synthetic QA point, not a buyer/device location
const pin = { version: 1, visibility: "pin", area: "Studio QA", coordinates: point, confirmed: true };
function formLocation(draft) {
  const form = new FormData();
  form.set("locationVisibility", draft.visibility);
  form.set("locationArea", draft.area);
  form.set("locationLat", draft.lat);
  form.set("locationLng", draft.lng);
  if (draft.confirmed) form.set("locationConfirmed", "on");
  return publicLocationFromForm(form);
}

test("portfolio CTA renders only valid public HTTP(S) links with safe external attributes", () => {
  for (const value of ["", null, "javascript:alert(1)", "data:text/html,bad", "//example.invalid", "https://name:secret@example.invalid", "not a URL"]) {
    assert.equal(publicUrl(value), "");
    assert.equal(render(PortfolioLink, { url: value }), "");
  }
  const html = render(PortfolioLink, { url: " https://portfolio.example.invalid/work " });
  assert.match(html, /href="https:\/\/portfolio.example.invalid\/work"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /Lihat Portfolio/);
});

test("footer retains branding/navigation and exposes the specified mailto destination", () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Footer)));
  assert.match(html, /href="mailto:digarsaofficial@gmail.com"/);
  assert.match(html, /Where Ideas Meet Talent/);
  assert.match(html, /href="\/marketplace"/);
});

test("shared avatar supports saved safe URLs, missing/unsafe fallback and menu sizing class", () => {
  const user = { id: "qa-user", name: "Studio QA", avatarUrl: "https://image.example.invalid/photo.jpg" };
  const html = render(Avatar, { user, className: "account-menu__avatar" });
  assert.match(html, /src="https:\/\/image.example.invalid\/photo.jpg"/);
  assert.match(html, /referrerPolicy="no-referrer"/);
  assert.match(html, /account-menu__avatar/);
  for (const avatarUrl of ["", "javascript:alert(1)", "data:image/svg+xml,bad"]) {
    const fallback = render(Avatar, { user: { ...user, avatarUrl } });
    assert.doesNotMatch(fallback, /<img/);
    assert.match(fallback, /Inisial Studio QA/);
    assert.match(fallback, />SQ</);
  }
});

test("seller fields initialize saved coordinates, show picker only for pin, and retain inheritance", () => {
  const html = render(PublicLocationFields, { initial: pin });
  assert.match(html, /Pilih lokasi layanan di peta/);
  assert.match(html, /name="locationLat"[^>]*value="-5.14"/);
  assert.match(html, /name="locationConfirmed"[^>]*checked/);
  assert.doesNotMatch(render(PublicLocationFields, { initial: { ...pin, visibility: "area", coordinates: null, confirmed: false } }), /Pilih lokasi layanan di peta/);
  assert.match(render(PublicLocationFields, { inherit: true }), /value="inherit" selected/);
});

test("selection drafts cancel without mutation; explicit confirmation uses the existing save contract", () => {
  const saved = structuredClone(pin);
  const draft = createPublicLocationDraft(saved);
  const preview = { lat: -5.15, lng: 119.43 };
  assert.deepEqual(formLocation(draft), saved);
  // A cancelled dialog never dispatches confirmPick into the parent form.
  const cancelled = createPublicLocationDraft(saved);
  assert.deepEqual(cancelled, draft);
  const confirmed = reduce(draft, { type: "confirmPick", point: preview });
  assert.deepEqual(saved, pin);
  assert.deepEqual(draft, cancelled);
  assert.deepEqual(formLocation(confirmed), { ...pin, coordinates: preview });
  const edited = reduce(confirmed, { type: "coordinate", field: "lat", value: "-5.16" });
  assert.equal(edited.confirmed, false);
  assert.throws(() => formLocation(edited), /konfirmasikan pin/);
  assert.throws(() => reduce(draft, { type: "confirmPick", point: { lat: 91, lng: 0 } }));
  assert.throws(() => parseCoordinates("bad", "119"));
});

test("hidden/area/inherit drafts remove public points without inferring coordinates", () => {
  const draft = createPublicLocationDraft(pin, true);
  const hidden = reduce(draft, { type: "visibility", value: "hidden" });
  assert.equal(publicLocation(formLocation(hidden)), null);
  assert.equal(hidden.lat, "");
  const area = reduce(draft, { type: "visibility", value: "area" });
  assert.deepEqual(formLocation(area), { version: 1, visibility: "area", area: "Studio QA", coordinates: null, confirmed: false });
  assert.equal(formLocation(reduce(draft, { type: "visibility", value: "inherit" })), null);
});

test("confirmed picker drafts save through real owner-scoped profile/service stores without changing buyer location", async () => {
  const { webcrypto } = await import("node:crypto");
  const { createDemoStore } = await import("../src/features/account/demoStore.js");
  const { createSellerStore } = await import("../src/features/seller/sellerStore.js");
  const { buildOverlay } = await import("../src/features/seller/sellerCatalog.js");
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const accounts = createDemoStore(storage, webcrypto);
  const user = await accounts.register({ name: "QA Studio", email: "picker@example.test", password: webcrypto.randomUUID() });
  const profile = accounts.activateSeller({ name: "QA Studio", category: "Branding", city: "Makassar", bio: "Studio sintetis untuk pengujian lokasi publik dan privasi.", specialties: "Branding", image: "", portfolioLink: "" });
  const privateLocation = { version: 1, city: "Makassar", coordinates: null, source: "city", consent: false };
  accounts.updateBuyerLocation(privateLocation, { expectedUserId: user.id });
  const catalog = createSellerStore({ storage, currentUser: () => accounts.current(), activeBookingCount: () => 0 });
  const input = { title: "Layanan lokasi QA", category: "Branding", price: 1500000, description: "Layanan sintetis untuk pengujian pemilih lokasi publik.", delivery: "Onsite", turnaround: "7 hari kerja", availability: "Open", image: "", serviceLocation: null };
  const service = catalog.create(input);
  const before = [...values];
  const draft = reduce(createPublicLocationDraft(pin), { type: "confirmPick", point });
  assert.deepEqual([...values], before); // Preview/confirmation is not a persistence operation.
  accounts.updateSellerProfile({ ...profile, specialties: "Branding", publicLocation: formLocation(draft) });
  assert.deepEqual(accounts.getOwnedSeller(profile.id).publicLocation, pin);
  const servicePoint = { lat: -5.16, lng: 119.44 };
  const override = reduce(createPublicLocationDraft(pin, true), { type: "confirmPick", point: servicePoint });
  catalog.update(service.id, { ...input, serviceLocation: formLocation(override) });
  assert.deepEqual(accounts.getOwnedSeller(profile.id).publicLocation, pin);
  assert.deepEqual(accounts.getBuyerLocation(), privateLocation);
  const overlay = () => buildOverlay({ profiles: accounts.listSellerProfiles(), records: catalog.catalogEntries().services });
  assert.deepEqual(overlay().services[0].publicLocation.coordinates, servicePoint);
  catalog.update(service.id, { ...input, delivery: "Remote", serviceLocation: formLocation(override) });
  assert.equal(overlay().services[0].publicLocation, null);
  await accounts.register({ name: "Other QA", email: "other-picker@example.test", password: webcrypto.randomUUID() });
  assert.throws(() => catalog.update(service.id, { ...input, serviceLocation: pin }));
  assert.throws(() => accounts.updateSellerProfile({ ...profile, specialties: "Branding", publicLocation: pin }));
  assert.throws(() => accounts.updateBuyerLocation(privateLocation, { expectedUserId: user.id }));
});

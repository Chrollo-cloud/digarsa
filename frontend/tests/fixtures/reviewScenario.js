import { webcrypto } from "node:crypto";
import { createDemoStore } from "../../src/features/account/demoStore.js";
import {
  createCustomerStore,
  CUSTOMER_KEY,
} from "../../src/features/customer/customerStore.js";
import { createSellerStore } from "../../src/features/seller/sellerStore.js";
import { buildOverlay } from "../../src/features/seller/sellerCatalog.js";

// Test fixture only. This supplies PRE-EXISTING Paid records and completes them
// through the real owning seller API. It adds no checkout or payment shortcut.
export async function reviewScenario() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const accounts = createDemoStore(storage, webcrypto);
  const password = "Reviews-demo-only-8742!";
  const seller = await accounts.register({
    name: "Studio Temu QA",
    email: "reviews-seller@example.test",
    password,
  });
  const profile = accounts.activateSeller({
    name: "Studio Temu QA",
    category: "Branding",
    city: "Makassar",
    bio: "Studio kreatif demo untuk pengujian ulasan dari kolaborasi nyata.",
    image: "",
    portfolioLink: "",
    specialties: "Branding, Packaging",
  });
  const sellerStore = createSellerStore({
    storage,
    currentUser: () => accounts.current(),
    baseServices: () => [],
    activeBookingCount: () => 0,
  });
  const service = sellerStore.create({
    title: "Identitas visual untuk usaha kreatif",
    category: "Branding",
    price: "1500000",
    delivery: "Remote",
    availability: "Open",
    turnaround: "7–10 hari kerja",
    image: "",
    description:
      "Paket identitas visual: logo, palet warna, tipografi, dan panduan pemakaian untuk bisnis kreatif.",
  });
  const overlay = buildOverlay({
    profiles: accounts.listSellerProfiles(),
    records: sellerStore.catalogEntries().services,
    fallbackImage: "/src/assets/home/workspace.jpg",
  });
  const orders = createCustomerStore({
    storage,
    currentUser: () => accounts.current(),
    catalog: overlay.services,
    creators: overlay.creators,
  });
  const buyer = await accounts.register({
    name: "Nadia Rahma QA",
    email: "reviews-buyer@example.test",
    password,
  });
  const brief = {
    requirements: "Logo dan pedoman warna untuk bisnis kreatif.",
    description:
      "Kami membutuhkan identitas visual untuk peluncuran usaha kreatif baru.",
  };
  const first = orders.createBooking(service.id, brief, {
    confirmed: true,
    expectedUserId: buyer.id,
  });
  const second = orders.createBooking(service.id, brief, {
    confirmed: true,
    expectedUserId: buyer.id,
  });
  const pending = orders.createBooking(service.id, brief, {
    confirmed: true,
    expectedUserId: buyer.id,
  });
  await accounts.login("reviews-seller@example.test", password);
  orders.respondToBooking(first.id, "accept");
  orders.respondToBooking(second.id, "accept");
  const paid = JSON.parse(values.get(CUSTOMER_KEY));
  for (const row of paid.bookings)
    if ([first.id, second.id].includes(row.id)) row.status = "Paid";
  values.set(CUSTOMER_KEY, JSON.stringify(paid));
  orders.respondToBooking(first.id, "complete", { expectedStatus: "Paid" });
  orders.respondToBooking(second.id, "complete", { expectedStatus: "Paid" });
  await accounts.login("reviews-buyer@example.test", password);
  return {
    values,
    storage,
    accounts,
    orders,
    seller,
    profile,
    buyer,
    service,
    catalog: overlay.services,
    first,
    second,
    pending,
    password,
  };
}

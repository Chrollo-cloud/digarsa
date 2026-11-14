import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { getBaseServices, syncCatalog } from "../../data/marketplace";
import workspace from "../../assets/home/workspace.jpg";
import { createSellerStore } from "./sellerStore";
import { buildOverlay } from "./sellerCatalog";
import { catalogStatus, createCatalogSync } from "./catalogSync";

export const sellerStore = createSellerStore({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  currentUser: () => demoStore.current(),
  baseServices: getBaseServices,
  // Orders live in the Phase 6 booking store; this only reads it to protect active work.
  activeBookingCount: (serviceId) =>
    customerStore.getActiveBookingCount(serviceId),
});

// Publish seller profiles/services and admin moderation into the shared catalog.
export const applyCatalog = createCatalogSync({
  readEntries: () => sellerStore.catalogEntries(),
  readProfiles: () =>
    demoStore.listSellerProfiles().map((row) => {
      const profile = demoStore.getBookableSeller(row.id);
      if (!profile)
        throw new Error("Seller Profile atau akun pemiliknya belum valid.");
      return profile;
    }),
  build: (input) => buildOverlay({ ...input, fallbackImage: workspace }),
  publish: syncCatalog,
  status: catalogStatus,
});
applyCatalog();
// Registered at import time so the catalog is current before any hook re-renders.
sellerStore.subscribe(applyCatalog);
demoStore.subscribe(applyCatalog);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key.startsWith("digarsa.demo.")) applyCatalog();
});

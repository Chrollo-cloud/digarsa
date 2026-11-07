import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { getBaseServices, syncCatalog } from "../../data/marketplace";
import workspace from "../../assets/home/workspace.jpg";
import { activeBookingStatuses, createSellerStore } from "./sellerStore";
import { buildOverlay } from "./sellerCatalog";

export const sellerStore = createSellerStore({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  currentUser: () => demoStore.current(),
  baseServices: getBaseServices,
  // Orders live in the Phase 6 booking store; this only reads it to protect active work.
  activeBookingCount: (serviceId) =>
    customerStore
      .sellerView()
      .bookings.filter(
        (booking) =>
          booking.serviceId === serviceId &&
          activeBookingStatuses.includes(booking.status),
      ).length,
});

// Publish seller profiles/services and admin moderation into the shared catalog.
export function applyCatalog() {
  try {
    const entries = sellerStore.catalogEntries();
    syncCatalog(
      buildOverlay({
        profiles: demoStore.listSellerProfiles(),
        records: entries.services,
        hiddenServiceIds: entries.hiddenServiceIds,
        fallbackImage: workspace,
      }),
    );
  } catch {
    syncCatalog();
  }
}
applyCatalog();
// Registered at import time so the catalog is current before any hook re-renders.
sellerStore.subscribe(applyCatalog);
demoStore.subscribe(applyCatalog);
window.addEventListener("storage", (event) => {
  if (!event.key || event.key.startsWith("digarsa.demo.")) applyCatalog();
});

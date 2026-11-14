import { demoStore } from "../account/demoStore";
import { services, creators } from "../../data/marketplace";
import { createCustomerStore } from "./customerStore";
import { catalogStatus } from "../seller/catalogSync";
import { resolveDemoEditorialSeller } from "./demoBookingFixture";
export const customerStore = createCustomerStore({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  currentUser: () => demoStore.current(),
  catalog: services,
  allowDemoPayment: () => import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_PAYMENT === "true",
  creators,
  resolveSellerProfile: (id) => demoStore.getBookableSeller(id),
  resolveDemoSellerProfile: (service) => resolveDemoEditorialSeller({
    service,
    development: import.meta.env.DEV === true,
    hostname: window.location.hostname,
    storage: window.localStorage,
    accounts: demoStore,
  }),
  catalogError: () => {
    const state = catalogStatus.snapshot();
    return state.error || (!state.hasValidCatalog ? "Katalog belum diverifikasi." : "");
  },
});

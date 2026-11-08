import { demoStore } from "../account/demoStore";
import { services, creators } from "../../data/marketplace";
import { createCustomerStore } from "./customerStore";
import { catalogStatus } from "../seller/catalogSync";
export const customerStore = createCustomerStore({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  currentUser: () => demoStore.current(),
  catalog: services,
  creators,
  resolveSellerProfile: (id) => demoStore.getBookableSeller(id),
  catalogError: () => {
    const state = catalogStatus.snapshot();
    return state.error || (!state.hasValidCatalog ? "Katalog belum diverifikasi." : "");
  },
});

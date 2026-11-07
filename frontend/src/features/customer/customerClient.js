import { demoStore } from "../account/demoStore";
import { services, creators } from "../../data/marketplace";
import { createCustomerStore } from "./customerStore";
export const customerStore = createCustomerStore({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  currentUser: () => demoStore.current(),
  catalog: services,
  creators,
});

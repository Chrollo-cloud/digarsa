import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { services } from "../../data/marketplace";
import { createReviewStore } from "./reviewStore";
import { createReviewAdapters } from "./reviewAdapters";
export { summarizeReviews } from "./reviewStore";

export const reviewStore = createReviewStore({
  ...createReviewAdapters({
    accounts: demoStore,
    customers: customerStore,
    getServices: () => services,
  }),
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
});

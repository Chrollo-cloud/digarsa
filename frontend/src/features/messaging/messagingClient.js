import { demoStore, ACCOUNT_KEY } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { CUSTOMER_KEY } from "../customer/customerStore";
import { services } from "../../data/marketplace";
import { createMessagingAdapters } from "./adapters";
import { createMessagingStore } from "./messagingStore";
import { MESSAGING_KEY } from "./contracts";
import { reviewStore } from "../reviews/reviewClient";

// Customer and Seller Messaging use this single shared instance. Reviews resolve
// through their authoritative repository; contracts and authorization are unchanged.
export const messagingStore = createMessagingStore({
  ...createMessagingAdapters({
    accounts: demoStore,
    customers: customerStore,
    getServices: () => services,
  }),
  resolveReview: (id) => reviewStore.getNotificationContext(id),
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  },
  subscribeExternal(listener) {
    const stopAccount = demoStore.subscribe(listener);
    const stopBooking = customerStore.subscribe(listener);
    const storageEvent = (event) => {
      if (
        !event.key ||
        [MESSAGING_KEY, ACCOUNT_KEY, CUSTOMER_KEY].includes(event.key)
      )
        listener();
    };
    window.addEventListener("storage", storageEvent);
    return () => {
      stopAccount();
      stopBooking();
      window.removeEventListener("storage", storageEvent);
    };
  },
});
export { MessagingError, messageSafety, notificationTypes } from "./contracts";

import { demoStore, ACCOUNT_KEY } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { CUSTOMER_KEY } from "../customer/customerStore";
import { services } from "../../data/marketplace";
import { createMessagingAdapters } from "./adapters";
import { createMessagingStore } from "./messagingStore";
import { MESSAGING_KEY } from "./contracts";

// Future customer and seller screens import this SAME instance. No UI, automatic
// booking hooks, review source, payment action, or new account provider is installed.
export const messagingStore = createMessagingStore({
  ...createMessagingAdapters({
    accounts: demoStore,
    customers: customerStore,
    getServices: () => services,
  }),
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

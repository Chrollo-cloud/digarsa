import { useSyncExternalStore } from "react";
import { CUSTOMER_KEY } from "../customer/customerStore";
import { customerStore } from "../customer/customerClient";
import { PAYOUT_KEY, payoutStore } from "../seller/payoutStore";

const keys = [CUSTOMER_KEY, PAYOUT_KEY];
function subscribe(listener) {
  const stops = [
    customerStore.subscribe(listener),
    payoutStore.subscribe(listener),
  ];
  const sync = (event) => {
    if (!event.key || keys.includes(event.key)) {
      if (!event.key || event.key === PAYOUT_KEY) payoutStore.refresh();
      listener();
    }
  };
  window.addEventListener("storage", sync);
  return () => {
    stops.forEach((stop) => stop());
    window.removeEventListener("storage", sync);
  };
}
const snapshot = () => `${customerStore.snapshot()}|${payoutStore.snapshot()}`;

// Re-render when shared booking or payout demo records change
// (same tab or another tab). Account changes arrive through the auth context.
export function useStoreSync() {
  useSyncExternalStore(subscribe, snapshot);
}

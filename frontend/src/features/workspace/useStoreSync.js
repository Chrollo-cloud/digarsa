import { useSyncExternalStore } from "react";
import { CUSTOMER_KEY } from "../customer/customerStore";
import { customerStore } from "../customer/customerClient";
import { SELLER_KEY } from "../seller/sellerStore";
import { sellerStore } from "../seller/sellerClient";

const keys = [CUSTOMER_KEY, SELLER_KEY];
function subscribe(listener) {
  const stops = [
    customerStore.subscribe(listener),
    sellerStore.subscribe(listener),
  ];
  const sync = (event) => {
    if (!event.key || keys.includes(event.key)) listener();
  };
  window.addEventListener("storage", sync);
  return () => {
    stops.forEach((stop) => stop());
    window.removeEventListener("storage", sync);
  };
}
const snapshot = () => `${customerStore.snapshot()}|${sellerStore.snapshot()}`;

// Re-render when the shared booking store or the seller catalog store changes
// (same tab or another tab). Account changes arrive through the auth context.
export function useStoreSync() {
  useSyncExternalStore(subscribe, snapshot);
}

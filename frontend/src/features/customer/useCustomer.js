import { useSyncExternalStore } from "react";
import { useAuth } from "../account/authContext";
import { CUSTOMER_KEY } from "./customerStore";
import { customerStore } from "./customerClient";

function subscribe(listener) {
  const stop = customerStore.subscribe(listener);
  const sync = (event) => {
    if (!event.key || event.key === CUSTOMER_KEY) listener();
  };
  window.addEventListener("storage", sync);
  return () => {
    stop();
    window.removeEventListener("storage", sync);
  };
}
export function useCustomer() {
  const { user } = useAuth();
  useSyncExternalStore(subscribe, customerStore.snapshot);
  return { user, ...customerStore.view(), store: customerStore };
}

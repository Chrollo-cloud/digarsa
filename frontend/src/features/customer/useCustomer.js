import { useEffect, useSyncExternalStore } from "react";
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
export function useAutoComplete() {
  useEffect(() => {
    const run = () => {
      try { customerStore.processAutoComplete(); } catch { /* Data tidak terbaca: tidak ada yang diselesaikan. */ }
    };
    run();
    const timer = setInterval(run, 60_000);
    return () => clearInterval(timer);
  }, []);
}

export function useCustomer() {
  const { user } = useAuth();
  useAutoComplete();
  useSyncExternalStore(subscribe, customerStore.snapshot);
  return { user, ...customerStore.view(), store: customerStore };
}
import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "../account/authContext";
import { ACCOUNT_KEY } from "../account/demoStore";
export function useBuyerLocation() {
  const { user, store } = useAuth();
  const read = useCallback(() => {
    if (!user) return JSON.stringify({ location: null, error: "" });
    try {
      return JSON.stringify({ location: store.getBuyerLocation(), error: "" });
    } catch (error) {
      return JSON.stringify({ location: null, error: error.message });
    }
  }, [user, store]);
  const subscribe = useCallback(
    (listener) => {
      const stop = store.subscribe(listener);
      const changed = (event) => {
        if (!event.key || event.key === ACCOUNT_KEY) listener();
      };
      window.addEventListener("storage", changed);
      return () => {
        stop();
        window.removeEventListener("storage", changed);
      };
    },
    [store],
  );
  return JSON.parse(useSyncExternalStore(subscribe, read));
}

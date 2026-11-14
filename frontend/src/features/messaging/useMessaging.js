import { useSyncExternalStore } from "react";
import { useAuth } from "../account/authContext";
import { messagingStore } from "./messagingClient";

// A render invalidation counter, not a second copy of persisted messaging data.
let revision = 0;
function subscribe(listener) {
  return messagingStore.subscribe(() => {
    revision += 1;
    listener();
  });
}
const snapshot = () => revision;

export function useMessaging(query) {
  const { user } = useAuth();
  useSyncExternalStore(subscribe, snapshot);
  try {
    return { user, data: user ? query() : null, error: "" };
  } catch (error) {
    return {
      user,
      data: null,
      error: error.message || "Data demo tidak dapat dibaca.",
    };
  }
}

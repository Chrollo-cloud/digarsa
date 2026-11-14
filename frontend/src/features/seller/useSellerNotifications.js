import { useSyncExternalStore } from "react";
import { messagingStore } from "../messaging/messagingClient.js";
import { sellerMessaging } from "./sellerMessagingClient.js";

let revision = 0;
function subscribe(listener) {
  return messagingStore.subscribe(() => {
    revision += 1;
    listener();
  });
}
const snapshot = () => revision;

// Reads and writes stay on the shared notification repository. This hook only
// subscribes UI consumers to the foundation's existing change signal.
export function useSellerNotifications() {
  const version = useSyncExternalStore(subscribe, snapshot);
  let notifications = [];
  let unreadCount = 0;
  let error = "";
  try {
    notifications = sellerMessaging.listNotifications();
    unreadCount = notifications.filter((notice) => !notice.is_read).length;
  } catch (failure) {
    error = failure.message || "Notifications could not be loaded.";
  }
  return { notifications, unreadCount, error, version };
}

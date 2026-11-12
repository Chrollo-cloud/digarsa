import { useSyncExternalStore } from "react";
import { useAuth } from "../account/authContext.js";
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

// Store reads are synchronous; this hook only invalidates the view on writes,
// account changes, and browser storage events from the shared client.
export function useSellerMessaging(conversationId = "") {
  const { user } = useAuth();
  const version = useSyncExternalStore(subscribe, snapshot);
  let inbox = [];
  let thread = null;
  let error = "";
  try {
    inbox = sellerMessaging.listInbox();
    if (conversationId) thread = sellerMessaging.getThread(conversationId);
  } catch (failure) {
    error = failure.message || "Messages could not be loaded.";
  }
  return { user, inbox, thread, error, version };
}

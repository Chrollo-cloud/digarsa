import { useSyncExternalStore } from "react";
import { useAuth } from "../account/authContext";
import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { reviewStore } from "./reviewClient";

let revision = 0;
const snapshot = () => revision;
function subscribe(listener) {
  const changed = () => {
    revision += 1;
    listener();
  };
  const stops = [
    reviewStore.subscribe(changed),
    demoStore.subscribe(changed),
    customerStore.subscribe(changed),
  ];
  const sync = (event) => {
    if (!event.key || event.key.startsWith("digarsa.demo.")) changed();
  };
  window.addEventListener("storage", sync);
  return () => {
    stops.forEach((stop) => stop());
    window.removeEventListener("storage", sync);
  };
}
export function useReviews(query) {
  const { user } = useAuth();
  useSyncExternalStore(subscribe, snapshot);
  try {
    return { user, data: query(), error: "" };
  } catch (error) {
    return {
      user,
      data: null,
      error: error.message || "Data ulasan belum tersedia.",
    };
  }
}

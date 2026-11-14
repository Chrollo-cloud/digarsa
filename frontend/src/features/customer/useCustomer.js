import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "../account/authContext";
import { CUSTOMER_KEY } from "./customerStore";
import { customerStore } from "./customerClient";
import { savedItemsStore } from "./savedItemsStore.js";

let sessionClearedFor = null;

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
  const { user, logout } = useAuth();
  useSyncExternalStore(subscribe, customerStore.snapshot);
  const savedState = useSyncExternalStore(savedItemsStore.subscribe, savedItemsStore.snapshot);
  useEffect(() => { savedItemsStore.activate(user?.id || null); }, [user?.id]);
  const savedItems = savedItemsStore.view(user?.id || null);
  useEffect(() => {
    const unauthorized = [savedItems.favorites.error, savedItems.cart.error].some((error) => error?.status === 401);
    if (unauthorized && user?.id && sessionClearedFor !== user.id) {
      sessionClearedFor = user.id;
      logout();
    } else if (!unauthorized) sessionClearedFor = null;
  }, [logout, user?.id, savedItems.favorites.error, savedItems.cart.error]);
  const localView = customerStore.view();
  return {
    user,
    ...localView,
    favorites: savedItems.favorites.items.map((item) => item.serviceId),
    cart: savedItems.cart.items.map((item) => item.serviceId),
    favoriteItems: savedItems.favorites.items,
    cartItems: savedItems.cart.items,
    savedItems,
    savedActions: savedItemsStore,
    savedState,
    store: customerStore,
  };
}

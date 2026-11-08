import { useAuth } from "../account/authContext";
import { customerStore } from "../customer/customerClient";
import { sellerStore } from "../seller/sellerClient";
import { useStoreSync } from "../workspace/useStoreSync";
import { creators } from "../../data/marketplace";

// Admin-only read model. Every underlying call re-checks `admin:access`.
export function useAdmin() {
  const { user, store } = useAuth();
  useStoreSync();
  let state = { bookings: [], services: [], accounts: [], error: "" };
  try {
    const orders = customerStore.adminView();
    const catalog = sellerStore.adminList();
    state = {
      bookings: orders.bookings,
      services: catalog.services,
      accounts: store.listAccountsForAdmin(),
      error: orders.error || catalog.error,
    };
  } catch (failure) {
    state.error = failure.message;
  }
  const creatorName = (id) =>
    creators.find((creator) => creator.id === id)?.name || "Kreator";
  return { user, ...state, creatorName, catalog: sellerStore };
}

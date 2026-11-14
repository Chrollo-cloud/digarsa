
import { useAuth } from "../account/authContext";
import { customerStore } from "../customer/customerClient";
import { sellerStore } from "../seller/sellerClient";
import { useStoreSync } from "../workspace/useStoreSync";
import { creators } from "../../data/marketplace";

// Admin-only read model. Every underlying call re-checks admin:access.
export function useAdmin() {
  const { user, store } = useAuth();
  useStoreSync();

  let state = {
    bookings: [],
    services: [],
    accounts: [],
    accountReports: [],
    error: "",
  };

  try {
    const orders = customerStore.adminView();
    const catalog = sellerStore.adminList();
    const accounts = store.listAccountsForAdmin();
    const accountReports = store.listAccountReportsForAdmin();

    state = {
      bookings: orders.bookings,
      services: catalog.services,
      accounts,
      accountReports,
      error: orders.error || catalog.error || "",
    };
  } catch (failure) {
    state.error = failure.message;
  }

  const creatorName = (id) =>
    creators.find((creator) => creator.id === id)?.name || "Creator";

  return {
    user,
    store,
    ...state,
    creatorName,
    catalog: sellerStore,
  };
}
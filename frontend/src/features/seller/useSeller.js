import { useAuth } from "../account/authContext";
import { customerStore } from "../customer/customerClient";
import { useStoreSync } from "../workspace/useStoreSync";
import { useSellerServices } from "./sellerServicesContext.js";

// Seller-scoped view of the shared booking store plus the seller's own services.
// Reads never throw into render: failures surface as `error`.
export function useSeller() {
  const { user, store } = useAuth();
  useStoreSync();
  const serverServices = useSellerServices();
  const attempt = (read, fallback) => {
    try {
      return [read(), ""];
    } catch (failure) {
      return [fallback, failure.message];
    }
  };
  const [orders, ordersError] = attempt(() => customerStore.sellerView(), {
    bookings: [],
    error: "",
  });
  const [profile] = attempt(
    () => store.getOwnedSeller(user.sellerProfileId),
    null,
  );
  const [customers] = attempt(
    () =>
      store.customerNames([
        ...new Set(orders.bookings.map((booking) => booking.customerId)),
      ]),
    {},
  );
  return {
    user,
    profile,
    bookings: orders.bookings,
    services: serverServices.services,
    servicesStatus: serverServices.status,
    servicesError: serverServices.error,
    customers,
    error: ordersError || orders.error,
    accounts: store,
    orders: customerStore,
    catalog: serverServices,
  };
}

import { useAuth } from "../account/authContext";
import { useAutoComplete } from "../customer/useCustomer";
import { customerStore } from "../customer/customerClient";
import { useStoreSync } from "../workspace/useStoreSync";
import { sellerStore } from "./sellerClient";

// Seller-scoped view of the shared booking store plus the seller's own services.
// Reads never throw into render: failures surface as `error`.
export function useSeller() {
  const { user, store } = useAuth();
  useStoreSync();
  useAutoComplete();
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
  const [services, servicesError] = attempt(() => sellerStore.mine(), {
    services: [],
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
    services: services.services,
    customers,
    error: ordersError || orders.error || servicesError || services.error,
    accounts: store,
    orders: customerStore,
    catalog: sellerStore,
  };
}
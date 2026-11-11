import { useAuth } from "../account/authContext";
import { customerStore } from "../customer/customerClient";
import { useStoreSync } from "../workspace/useStoreSync";
import { sellerStore } from "./sellerClient";

export function useSeller() {
  const { user, store } = useAuth();
  useStoreSync();

  const attempt = (read, fallback) => {
    try {
      return [read(), ""];
    } catch (failure) {
      return [fallback, failure.message];
    }
  };

  const [orders, ordersError] = attempt(
    () => customerStore.sellerView(),
    { bookings: [], error: "" },
  );

  const [services, servicesError] = attempt(
    () => sellerStore.mine(),
    { services: [], error: "" },
  );

  const [profile] = attempt(
    () => store.getOwnedSeller(user.sellerProfileId),
    null,
  );

  const customerIds = [
    ...new Set(orders.bookings.map((booking) => booking.customerId)),
  ];

  const [customers] = attempt(
    () => store.customerNames(customerIds),
    {},
  );

  const [customerProfiles] = attempt(
    () => store.customerIdentities(customerIds),
    {},
  );

  return {
    user,
    profile,
    bookings: orders.bookings,
    services: services.services,
    customers,
    customerProfiles,
    error: ordersError || orders.error || servicesError || services.error,
    accounts: store,
    orders: customerStore,
    catalog: sellerStore,
  };
}
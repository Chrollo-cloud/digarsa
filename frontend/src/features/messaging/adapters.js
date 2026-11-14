import { MessagingError } from "./contracts.js";

// Translate the existing camelCase demo entities at the boundary. Messaging
// records and resolver contracts themselves use only the agreed snake_case names.
export function createMessagingAdapters({ accounts, customers, getServices }) {
  return {
    currentUser: () => accounts.current(),
    resolveSellerProfile(id) {
      const profile = accounts
        .listSellerProfiles()
        .find((row) => row.id === id);
      return profile
        ? { id: profile.id, owner_user_id: profile.ownerUserId }
        : null;
    },
    resolveService(id) {
      const service = getServices().find((row) => row.id === id);
      return service
        ? { id: service.id, seller_profile_id: service.creatorId }
        : null;
    },
    resolveBooking(id) {
      const owned = customers.view();
      if (owned.error)
        throw new MessagingError("DEPENDENCY_UNAVAILABLE", owned.error);
      let booking = owned.bookings.find((row) => row.id === id);
      if (!booking && accounts.current()?.capabilities.includes("seller")) {
        const incoming = customers.sellerView();
        if (incoming.error)
          throw new MessagingError("DEPENDENCY_UNAVAILABLE", incoming.error);
        booking = incoming.bookings.find((row) => row.id === id);
      }
      return booking
        ? {
            id: booking.id,
            customer_user_id: booking.customerId,
            seller_profile_id: booking.creatorId,
            service_id: booking.serviceId,
            status: booking.status,
            demo_payment: booking.demoPayment?.kind === "simulation",
          }
        : null;
    },
  };
}

import { ReviewError } from "./reviewStore.js";

export function createReviewAdapters({ accounts, customers, getServices }) {
  return {
    currentUser: () => accounts.current(),
    listBookings() {
      const view = customers.view();
      if (view.error)
        throw new ReviewError("DEPENDENCY_UNAVAILABLE", view.error);
      return view.bookings.map((row) => ({
        id: row.id,
        customer_user_id: row.customerId,
        seller_profile_id: row.creatorId,
        service_id: row.serviceId,
        status: row.status,
        service_title: row.serviceTitle,
        seller_name: row.creatorName,
        created_at: row.createdAt,
        completed_at: row.status === "Completed" ? row.updatedAt || null : null,
      }));
    },
    resolveSellerProfile(id) {
      const row = accounts.listSellerProfiles().find((row) => row.id === id);
      return row ? { id: row.id, owner_user_id: row.ownerUserId } : null;
    },
    resolveService(id) {
      const row = getServices().find((row) => row.id === id);
      return row ? { id: row.id, seller_profile_id: row.creatorId } : null;
    },
  };
}

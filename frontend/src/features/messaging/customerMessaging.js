import { MessagingError, messageSafety } from "./contracts.js";

const denied = () => {
  throw new MessagingError(
    "NOT_FOUND_OR_FORBIDDEN",
    "This conversation is unavailable in your customer workspace.",
  );
};

// Stateless customer-facing facade over the ONE shared repository. No persistence,
// sender IDs, notification recipients, or seller permissions are supplied by UI.
export function createCustomerMessaging({
  messaging,
  accounts,
  customers,
  getServices,
}) {
  function account() {
    const user = accounts.current();
    if (!user)
      throw new MessagingError("UNAUTHENTICATED", "Log in untuk membuka pesan.");
    return user;
  }
  function ownedBooking(id) {
    const view = customers.view();
    if (view.error)
      throw new MessagingError("DEPENDENCY_UNAVAILABLE", view.error);
    const booking = view.bookings.find((row) => row.id === id);
    if (!booking || booking.customerId !== account().id) denied();
    return booking;
  }
  function customerConversation(id) {
    const conversation = messaging.getConversation(id);
    if (conversation.customer_user_id !== account().id) denied();
    return conversation;
  }
  function identity(conversation) {
    const profile = accounts
      .listSellerProfiles()
      .find((row) => row.id === conversation.seller_profile_id);
    const service = getServices().find(
      (row) => row.id === conversation.service_id,
    );
    return {
      seller_name: profile?.name || profile?.studioName || "Creator Digarsa",
      seller_image: profile?.image || null,
      service_title:
        service?.title ||
        (conversation.booking_id ? "Percakapan booking" : "Creative discussion"),
      service_available: !!service,
    };
  }
  function inbox() {
    const user = account();
    return messaging
      .listConversations()
      .filter((row) => row.customer_user_id === user.id)
      .map((row) => {
        const messages = messaging.listMessages(row.id);
        return {
          ...row,
          ...identity(row),
          last_message: messages.at(-1) || null,
          unread_count: messages.filter(
            (item) => item.sender_user_id !== user.id && item.read_at === null,
          ).length,
        };
      });
  }
  const api = {
    listInbox: inbox,
    getThread(id) {
      const conversation = customerConversation(id);
      return {
        conversation: { ...conversation, ...identity(conversation) },
        messages: messaging.listMessages(id),
      };
    },
    send(id, content, options) {
      customerConversation(id);
      return messaging.sendMessage(id, content, options);
    },
    markRead(id) {
      customerConversation(id);
      return messaging.markConversationRead(id);
    },
    startService(service_id) {
      const user = account();
      const service = getServices().find((row) => row.id === service_id);
      if (!service)
        throw new MessagingError("INVALID_CONTEXT", "Service unavailable.");
      const conversation = messaging.getOrCreateConversation({
        customer_user_id: user.id,
        seller_profile_id: service.creatorId,
        service_id,
      });
      return conversation;
    },
    startBooking(booking_id) {
      ownedBooking(booking_id);
      return messaging.getOrCreateConversation({ booking_id });
    },
    contactAvailability(seller_profile_id) {
      const profile = accounts
        .listSellerProfiles()
        .find((row) => row.id === seller_profile_id);
      if (!profile)
        return "Chat belum tersedia: kreator editorial ini belum memiliki akun pemilik terverifikasi.";
      if (accounts.current()?.id === profile.ownerUserId)
        return "Kamu tidak dapat mengirim pesan ke Seller Profile milikmu sendiri.";
      return "";
    },
    listNotifications() {
      const notifications = messaging.listNotifications();
      // Related IDs never become URLs without verifying the current account's
      // customer context. Seller notifications belong in Seller Center.
      const conversations = inbox();
      const view = customers.view();
      if (view.error)
        throw new MessagingError("DEPENDENCY_UNAVAILABLE", view.error);
      const user = account();
      return notifications.map((notice) => {
        let to = null;
        if (notice.type === "new_message") {
          const conversation = conversations.find((row) =>
            messaging
              .listMessages(row.id)
              .some((item) => item.id === notice.related_entity_id),
          );
          if (conversation)
            to = `/messages/${encodeURIComponent(conversation.id)}`;
        } else if (notice.type.startsWith("booking_")) {
          const booking = view.bookings.find(
            (row) =>
              row.id === notice.related_entity_id && row.customerId === user.id,
          );
          if (booking) to = `/orders/${encodeURIComponent(booking.id)}`;
        }
        return { ...notice, to };
      }).filter((notice) => notice.to !== null);
    },
    markNotificationRead(id) {
      if (!api.listNotifications().some((notice) => notice.id === id)) denied();
      return messaging.markNotificationRead(id);
    },
    counts() {
      return {
        messages: inbox().reduce((total, row) => total + row.unread_count, 0),
        notifications: api.listNotifications().filter((notice) => !notice.is_read).length,
      };
    },
    notifyRequested(booking_id) {
      const booking = ownedBooking(booking_id);
      if (booking.status !== "Requested")
        throw new MessagingError(
          "INVALID_CONTEXT",
          "Booking bukan permintaan baru.",
        );
      if (api.contactAvailability(booking.creatorId)) return null;
      return messaging.notifyBookingEvent(booking_id);
    },
  };
  return api;
}

export { messageSafety };

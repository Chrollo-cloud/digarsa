import { MessagingError } from "../messaging/contracts.js";

const denied = () =>
  new MessagingError(
    "NOT_FOUND_OR_FORBIDDEN",
    "Percakapan tidak tersedia di Seller Center akunmu.",
  );

// A role-scoped view over the shared messaging repository. This facade owns no
// persistence and never accepts sender or recipient IDs from the UI.
export function createSellerMessaging({
  messaging,
  accounts,
  customers,
  getServices,
}) {
  function seller() {
    const user = accounts.current();
    if (!user?.id || !user.sellerProfileId || !user.capabilities?.includes("seller"))
      throw new MessagingError(
        "UNAUTHENTICATED",
        "Seller Profile aktif diperlukan untuk membuka pesan.",
      );
    return user;
  }

  function bookingFor(conversation) {
    if (!conversation.booking_id) return null;
    const view = customers.sellerView();
    if (view.error)
      throw new MessagingError("DEPENDENCY_UNAVAILABLE", view.error);
    return (
      view.bookings.find(
        (booking) =>
          booking.id === conversation.booking_id &&
          booking.creatorId === conversation.seller_profile_id &&
          booking.customerId === conversation.customer_user_id,
      ) || null
    );
  }

  function decorate(conversation, messages, identities) {
    const identity = identities[conversation.customer_user_id];
    const service = conversation.service_id
      ? getServices().find((item) => item.id === conversation.service_id)
      : null;
    const booking = bookingFor(conversation);
    return {
      ...conversation,
      customer_name: identity?.name || "Customer Digarsa",
      customer_avatar_url: identity?.avatarUrl || "",
      service_title:
        service?.title || booking?.serviceTitle || "Percakapan Digarsa",
      last_message: messages.at(-1) || null,
      last_activity_at:
        messages.at(-1)?.created_at || conversation.updated_at,
      unread_count: messages.filter(
        (message) =>
          message.sender_user_id !== accounts.current()?.id &&
          message.read_at === null,
      ).length,
    };
  }

  function authorizedConversation(conversationId) {
    const user = seller();
    const conversation = messaging.getConversation(conversationId);
    if (conversation.seller_profile_id !== user.sellerProfileId) throw denied();
    return conversation;
  }

  function customerIdentities(conversations) {
    const ids = [...new Set(conversations.map((item) => item.customer_user_id))];
    return accounts.customerIdentities(ids);
  }

  const api = {
    listInbox() {
      const user = seller();
      const conversations = messaging
        .listConversations()
        .filter((item) => item.seller_profile_id === user.sellerProfileId);
      const identities = customerIdentities(conversations);
      return conversations
        .map((conversation) => {
          const messages = messaging.listMessages(conversation.id);
          return decorate(conversation, messages, identities);
        })
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
    },
    getThread(conversationId) {
      const conversation = authorizedConversation(conversationId);
      const messages = messaging.listMessages(conversationId);
      const identities = customerIdentities([conversation]);
      return {
        conversation: decorate(conversation, messages, identities),
        messages,
      };
    },
    send(conversationId, content, options = {}) {
      authorizedConversation(conversationId);
      return messaging.sendMessage(conversationId, content, options);
    },
    markRead(conversationId) {
      authorizedConversation(conversationId);
      return messaging.markConversationRead(conversationId);
    },
    listNotifications() {
      const user = seller();
      const conversations = messaging
        .listConversations()
        .filter((item) => item.seller_profile_id === user.sellerProfileId);
      const conversationByMessage = new Map();
      for (const conversation of conversations)
        for (const message of messaging.listMessages(conversation.id))
          conversationByMessage.set(message.id, conversation);

      const bookingView = customers.sellerView();
      if (bookingView.error)
        throw new MessagingError("DEPENDENCY_UNAVAILABLE", bookingView.error);
      const sellerBookingIds = new Set(
        bookingView.bookings
          .filter((booking) => booking.creatorId === user.sellerProfileId)
          .map((booking) => booking.id),
      );

      return messaging.listNotifications().flatMap((notice) => {
        if (notice.type === "new_message") {
          const conversation = conversationByMessage.get(notice.related_entity_id);
          if (!conversation) return [];
          return [{
            ...notice,
            to: `/seller-dashboard/messages/${encodeURIComponent(conversation.id)}`,
          }];
        }
        if (notice.type === "booking_requested") {
          if (!sellerBookingIds.has(notice.related_entity_id)) return [];
          return [{
            ...notice,
            to: `/seller-dashboard/orders/${encodeURIComponent(notice.related_entity_id)}`,
          }];
        }
        if (notice.type === "new_review") {
          // Foundation only returns notices addressed to this account; a review
          // event belongs to the owner's Seller Profile, not a buyer-side inbox.
          return [{
            ...notice,
            to: `/seller/${encodeURIComponent(user.sellerProfileId)}`,
          }];
        }
        // Other booking events currently notify the customer participant.
        return [];
      });
    },
    markNotificationRead(notificationId) {
      const allowed = api
        .listNotifications()
        .some((notice) => notice.id === notificationId);
      if (!allowed) throw denied();
      return messaging.markNotificationRead(notificationId);
    },
    getUnreadNotificationCount() {
      return api.listNotifications().filter((notice) => !notice.is_read).length;
    },
  };
  return api;
}


import { MessagingError } from "../messaging/contracts.js";

const denied = () =>
  new MessagingError(
    "NOT_FOUND_OR_FORBIDDEN",
    "Percakapan tidak tersedia di Seller Center akunmu.",
  );

// A role-scoped view over the shared messaging repository.
// This facade owns no persistence and never accepts sender or recipient IDs from the UI.
export function createSellerMessaging({
  messaging,
  accounts,
  customers,
  getServices,
}) {
  function seller() {
    const user = accounts.current();

    if (
      !user?.id ||
      !user.sellerProfileId ||
      !user.capabilities?.includes("seller")
    ) {
      throw new MessagingError(
        "UNAUTHENTICATED",
        "Seller Profile aktif diperlukan untuk membuka pesan.",
      );
    }

    return user;
  }

  function bookingFor(conversation) {
    if (!conversation.booking_id) return null;

    const view = customers.sellerView();

    if (view.error) {
      throw new MessagingError(
        "DEPENDENCY_UNAVAILABLE",
        view.error,
      );
    }

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
      ? getServices().find(
          (item) => item.id === conversation.service_id,
        )
      : null;

    const booking = bookingFor(conversation);

    return {
      ...conversation,
      customer_name: identity?.name || "Customer Digarsa",
      customer_avatar_url: identity?.avatarUrl || "",
      service_title:
        service?.title ||
        booking?.serviceTitle ||
        "Percakapan Digarsa",
      service_available: !!service,
      // Data kartu produk di chat (gambar + harga layanan + status booking).
      service_image: service?.image || service?.images?.[0]?.src || null,
      service_price: service?.price ?? null,
      booking_status: booking?.status || null,
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

    if (conversation.seller_profile_id !== user.sellerProfileId) {
      throw denied();
    }

    return conversation;
  }

  function customerIdentities(conversations) {
    const ids = [
      ...new Set(
        conversations.map((item) => item.customer_user_id),
      ),
    ];

    return accounts.customerIdentities(ids);
  }

  function newestFirst(a, b) {
    return (
      String(b.last_activity_at || "").localeCompare(
        String(a.last_activity_at || ""),
      ) || String(b.id).localeCompare(String(a.id))
    );
  }

  // Collect every conversation belonging to the same Customer
  // and the currently authenticated Seller Profile.
  function collectCustomerGroup(conversation) {
    const user = seller();

    return messaging
      .listConversations()
      .filter(
        (item) =>
          item.seller_profile_id === user.sellerProfileId &&
          item.customer_user_id === conversation.customer_user_id,
      );
  }

  function buildGroup(conversations, identities, selectedId = "") {
    const contexts = conversations
      .map((context) => {
        const messages = messaging.listMessages(context.id);
        return decorate(context, messages, identities);
      })
      .sort(newestFirst);

    const messages = contexts
      .flatMap((context) =>
        messaging.listMessages(context.id).map((message) => ({
          ...message,
          context_id: context.id,
          context_service_id: context.service_id,
          context_booking_id: context.booking_id,
          context_service_title: context.service_title,
        })),
      )
      .sort(
        (a, b) =>
          String(a.created_at).localeCompare(String(b.created_at)) ||
          String(a.id).localeCompare(String(b.id)),
      );

    const anchor =
      contexts.find((context) => context.id === selectedId) ||
      contexts[0];

    if (!anchor) return null;

    const latestMessage = messages.at(-1) || null;

    return {
      ...anchor,
      id: selectedId || anchor.id,
      conversation_ids: contexts.map((context) => context.id),
      contexts,
      last_message: latestMessage,
      last_activity_at:
        latestMessage?.created_at || anchor.last_activity_at,
      unread_count: contexts.reduce(
        (total, context) => total + context.unread_count,
        0,
      ),
    };
  }

  const api = {
    // One inbox row for each Customer, regardless of the number
    // of services or bookings they have discussed with this Seller.
    listInbox() {
      const user = seller();

      const conversations = messaging
        .listConversations()
        .filter(
          (item) =>
            item.seller_profile_id === user.sellerProfileId,
        );

      const identities = customerIdentities(conversations);
      const customerGroups = new Map();

      for (const conversation of conversations) {
        const key = conversation.customer_user_id;

        if (!customerGroups.has(key)) {
          customerGroups.set(key, []);
        }

        customerGroups.get(key).push(conversation);
      }

      return [...customerGroups.values()]
        .map((group) => buildGroup(group, identities))
        .filter(Boolean)
        .sort(newestFirst);
    },

    // Any original conversation ID opens the combined Customer thread.
    getThread(conversationId) {
      const conversation = authorizedConversation(conversationId);
      const group = collectCustomerGroup(conversation);
      const identities = customerIdentities(group);

      const combined = buildGroup(
        group,
        identities,
        conversationId,
      );

      if (!combined) throw denied();

      const messages = group
        .flatMap((context) =>
          messaging.listMessages(context.id).map((message) => ({
            ...message,
            context_id: context.id,
            context_service_id: context.service_id,
            context_booking_id: context.booking_id,
            context_service_title:
              combined.contexts.find(
                (item) => item.id === context.id,
              )?.service_title || "Percakapan Digarsa",
          })),
        )
        .sort(
          (a, b) =>
            String(a.created_at).localeCompare(String(b.created_at)) ||
            String(a.id).localeCompare(String(b.id)),
        );

      return {
        conversation: combined,
        messages,
      };
    },

    // Keep the original single-conversation send method for compatibility.
    send(conversationId, content, options = {}) {
      authorizedConversation(conversationId);

      return messaging.sendMessage(
        conversationId,
        content,
        options,
      );
    },

    // Send to the exact service/booking context selected by the Seller.
    sendForCustomer(
      anchorConversationId,
      targetConversationId,
      content,
      options = {},
    ) {
      const anchor = authorizedConversation(anchorConversationId);
      const target = authorizedConversation(targetConversationId);

      if (
        anchor.customer_user_id !== target.customer_user_id ||
        anchor.seller_profile_id !== target.seller_profile_id
      ) {
        throw denied();
      }

      return messaging.sendMessage(
        targetConversationId,
        content,
        options,
      );
    },

    // Opening a combined thread marks all its contexts as read.
    markRead(conversationId) {
      const selected = authorizedConversation(conversationId);
      const group = collectCustomerGroup(selected);

      for (const conversation of group) {
        messaging.markConversationRead(conversation.id);
      }

      return true;
    },

    listNotifications() {
      const user = seller();

      const conversations = messaging
        .listConversations()
        .filter(
          (item) =>
            item.seller_profile_id === user.sellerProfileId,
        );

      const conversationByMessage = new Map();

      for (const conversation of conversations) {
        for (const message of messaging.listMessages(conversation.id)) {
          conversationByMessage.set(message.id, conversation);
        }
      }

      const bookingView = customers.sellerView();

      if (bookingView.error) {
        throw new MessagingError(
          "DEPENDENCY_UNAVAILABLE",
          bookingView.error,
        );
      }

      const sellerBookingIds = new Set(
        bookingView.bookings
          .filter(
            (booking) =>
              booking.creatorId === user.sellerProfileId,
          )
          .map((booking) => booking.id),
      );

      return messaging.listNotifications().flatMap((notice) => {
        if (notice.type === "new_message") {
          const conversation = conversationByMessage.get(
            notice.related_entity_id,
          );

          if (!conversation) return [];

          return [
            {
              ...notice,
              to: `/seller-dashboard/messages/${encodeURIComponent(
                conversation.id,
              )}`,
            },
          ];
        }

        if (notice.type === "booking_requested") {
          if (!sellerBookingIds.has(notice.related_entity_id)) {
            return [];
          }

          return [
            {
              ...notice,
              to: `/seller-dashboard/orders/${encodeURIComponent(
                notice.related_entity_id,
              )}`,
            },
          ];
        }

        if (notice.type === "new_review") {
          return [
            {
              ...notice,
              to: `/seller/${encodeURIComponent(
                user.sellerProfileId,
              )}`,
            },
          ];
        }

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
      return api
        .listNotifications()
        .filter((notice) => !notice.is_read).length;
    },
  };

  return api;
}
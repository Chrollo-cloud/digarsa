import { MessagingError, messageSafety } from "./contracts.js";

const denied = () => {
  throw new MessagingError(
    "NOT_FOUND_OR_FORBIDDEN",
    "Percakapan tidak tersedia di ruang pelanggan akunmu.",
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
      throw new MessagingError("UNAUTHENTICATED", "Masuk untuk membuka pesan.");
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
      seller_name: profile?.name || profile?.studioName || "Kreator Digarsa",
      seller_image: profile?.image || null,
      service_title:
        service?.title ||
        (conversation.booking_id ? "Percakapan booking" : "Diskusi kreatif"),
      service_available: !!service,
      // Data kartu produk di chat (gambar + harga layanan).
      service_image: service?.image || service?.images?.[0]?.src || null,
      service_price: service?.price ?? null,
    };
  }
  const newestFirst = (a, b) =>
    String(b.last_activity_at).localeCompare(String(a.last_activity_at)) ||
    String(b.id).localeCompare(String(a.id));
  const oldestFirst = (a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) ||
    String(a.id).localeCompare(String(b.id));

  // Semua percakapan mentah (satu per layanan/booking) milik customer.
  function ownConversations() {
    const user = account();
    return messaging
      .listConversations()
      .filter((row) => row.customer_user_id === user.id);
  }
  // Semua percakapan dengan Seller yang sama = SATU chat bagi customer.
  const sameSeller = (all, sellerProfileId) =>
    all.filter((row) => row.seller_profile_id === sellerProfileId);

  function buildGroup(conversations) {
    const user = account();
    const contexts = conversations
      .map((row) => {
        const messages = messaging.listMessages(row.id);
        return {
          ...row,
          ...identity(row),
          last_message: messages.at(-1) || null,
          last_activity_at: messages.at(-1)?.created_at || row.updated_at,
          unread_count: messages.filter(
            (item) => item.sender_user_id !== user.id && item.read_at === null,
          ).length,
        };
      })
      .sort(newestFirst);
    const latest = contexts[0];
    // ID untuk URL: percakapan paling lama, tidak berubah saat ada booking baru.
    const canonical = [...contexts].sort(oldestFirst)[0];
    const titles = [...new Set(contexts.map((row) => row.service_title))];
    const lastMessage =
      contexts
        .map((row) => row.last_message)
        .filter(Boolean)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .at(-1) || null;
    return {
      ...latest,
      id: canonical.id,
      conversation_ids: contexts.map((row) => row.id),
      contexts,
      service_title:
        titles.length > 1
          ? `${titles[0]} +${titles.length - 1} lainnya`
          : titles[0],
      booking_id: contexts.some((row) => row.booking_id)
        ? latest.booking_id || contexts.find((row) => row.booking_id).booking_id
        : null,
      last_message: lastMessage,
      last_activity_at: lastMessage?.created_at || latest.last_activity_at,
      unread_count: contexts.reduce((sum, row) => sum + row.unread_count, 0),
    };
  }
  function inbox() {
    const all = ownConversations();
    const groups = new Map();
    for (const row of all) {
      if (!groups.has(row.seller_profile_id)) groups.set(row.seller_profile_id, []);
      groups.get(row.seller_profile_id).push(row);
    }
    return [...groups.values()].map(buildGroup).sort(newestFirst);
  }
  const api = {
    listInbox: inbox,
    // ID percakapan mana pun dalam grup membuka thread gabungan yang sama.
    getThread(id) {
      const conversation = customerConversation(id);
      const group = sameSeller(ownConversations(), conversation.seller_profile_id);
      const combined = buildGroup(group);
      const titleOf = new Map(
        combined.contexts.map((row) => [row.id, row.service_title]),
      );
      const messages = group
        .flatMap((row) =>
          messaging.listMessages(row.id).map((message) => ({
            ...message,
            context_id: row.id,
            context_service_id: row.service_id,
            context_booking_id: row.booking_id,
            context_service_title: titleOf.get(row.id),
          })),
        )
        .sort(
          (a, b) =>
            String(a.created_at).localeCompare(String(b.created_at)) ||
            String(a.id).localeCompare(String(b.id)),
        );
      return { conversation: combined, messages };
    },
    // `id` = konteks (layanan/booking) yang dipakai untuk mengirim pesan.
    send(id, content, options) {
      customerConversation(id);
      return messaging.sendMessage(id, content, options);
    },
    // Membuka thread gabungan menandai semua konteks dengan seller ini sebagai dibaca.
    markRead(id) {
      const conversation = customerConversation(id);
      let total = 0;
      for (const row of sameSeller(ownConversations(), conversation.seller_profile_id))
        total += messaging.markConversationRead(row.id).messages_marked_read;
      return { messages_marked_read: total };
    },
    startService(service_id) {
      const user = account();
      const service = getServices().find((row) => row.id === service_id);
      if (!service)
        throw new MessagingError("INVALID_CONTEXT", "Layanan tidak tersedia.");
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
      const conversations = ownConversations();
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
          if (conversation) {
            const canonical = sameSeller(
              conversations,
              conversation.seller_profile_id,
            ).sort(oldestFirst)[0];
            to = `/messages/${encodeURIComponent(canonical.id)}`;
          }
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
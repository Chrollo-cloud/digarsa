import {
  MESSAGING_KEY,
  MessagingError,
  contextKey,
  emptyEnvelope,
  fail,
  isId,
  isTime,
  normalizeContent,
  validateEnvelope,
} from "./contracts.js";

const copy = (row) => ({ ...row });
const denied = () =>
  fail(
    "NOT_FOUND_OR_FORBIDDEN",
    "Data tidak ditemukan atau bukan milik akunmu.",
  );
const requestKeys = (input, allowed) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    fail("INVALID_INPUT", "Field permintaan tidak didukung.");
};

// Synchronous demo repository. Dependencies resolve live, account-scoped source
// entities; UI consumers never read localStorage or supply sender/recipient IDs.
export function createMessagingStore({
  storage,
  currentUser,
  resolveSellerProfile,
  resolveService,
  resolveBooking,
  resolveReview,
  randomId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
  subscribeExternal,
}) {
  const listeners = new Set();
  function actor() {
    let user;
    try {
      user = currentUser();
    } catch {
      fail("SESSION_UNAVAILABLE", "Sesi demo tidak dapat dibaca.");
    }
    if (!user || !isId(user.id))
      fail("UNAUTHENTICATED", "Masuk ke akun Digarsa untuk melanjutkan.");
    return user;
  }
  function load() {
    let raw;
    try {
      raw = storage.getItem(MESSAGING_KEY);
    } catch {
      fail("STORAGE_UNAVAILABLE", "Penyimpanan pesan demo tidak dapat dibaca.");
    }
    if (raw === null) return emptyEnvelope();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      fail(
        "STORAGE_CORRUPT",
        "Data pesan demo rusak. Data tidak ditimpa; periksa penyimpanan browser.",
      );
    }
    return validateEnvelope(data);
  }
  function save(data) {
    validateEnvelope(data);
    try {
      storage.setItem(MESSAGING_KEY, JSON.stringify(data));
    } catch {
      fail(
        "STORAGE_UNAVAILABLE",
        "Perubahan belum tersimpan. Penyimpanan browser tidak tersedia atau penuh.",
      );
    }
    // A subscriber failure cannot turn a completed write into a reported failure.
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* Consumer owns rendering errors. */
      }
    });
  }
  function timestamp(floor = "") {
    let value;
    try {
      value = now();
    } catch {
      fail("INVALID_DEPENDENCY", "Waktu demo tidak tersedia.");
    }
    if (!isTime(value)) fail("INVALID_DEPENDENCY", "Waktu demo tidak valid.");
    return value < floor ? floor : value;
  }
  function id(data, prefix) {
    let value;
    try {
      value = `${prefix}-${randomId()}`;
    } catch {
      fail("INVALID_DEPENDENCY", "Pembuat ID demo tidak tersedia.");
    }
    if (
      !isId(value) ||
      [...data.conversations, ...data.messages, ...data.notifications].some(
        (row) => row.id === value,
      )
    )
      fail("ID_COLLISION", "ID demo tidak valid atau bertabrakan. Coba lagi.");
    return value;
  }
  function resolve(reader, entityId) {
    if (!reader)
      fail(
        "UNSUPPORTED_EVENT",
        "Sumber data untuk peristiwa ini belum tersedia.",
      );
    try {
      return reader(entityId);
    } catch (error) {
      if (error instanceof MessagingError) throw error;
      fail(
        "DEPENDENCY_UNAVAILABLE",
        "Sumber data akun, layanan, atau booking tidak dapat diverifikasi.",
      );
    }
  }
  function seller(profileId) {
    const profile = resolve(resolveSellerProfile, profileId);
    if (!profile || profile.id !== profileId || !isId(profile.owner_user_id))
      fail(
        "INVALID_CONTEXT",
        "Seller Profile tidak tersedia atau tidak valid.",
      );
    return profile;
  }
  function context(input, user, creating = false) {
    requestKeys(input, [
      "customer_user_id",
      "seller_profile_id",
      "service_id",
      "booking_id",
    ]);
    for (const value of Object.values(input))
      if (value !== null && !isId(value))
        fail("INVALID_INPUT", "ID konteks tidak valid.");
    const booking = input.booking_id
      ? resolve(resolveBooking, input.booking_id)
      : null;
    if (input.booking_id && (!booking || booking.id !== input.booking_id))
      denied();
    const row = {
      customer_user_id:
        input.customer_user_id ??
        booking?.customer_user_id ??
        (creating ? user.id : null),
      seller_profile_id:
        input.seller_profile_id ?? booking?.seller_profile_id ?? null,
      service_id: input.service_id ?? booking?.service_id ?? null,
      booking_id: input.booking_id ?? null,
    };
    if (!isId(row.customer_user_id) || !isId(row.seller_profile_id))
      fail(
        "INVALID_CONTEXT",
        "Konteks pelanggan dan Seller Profile diperlukan.",
      );
    const profile = seller(row.seller_profile_id);
    if (profile.owner_user_id === row.customer_user_id)
      fail("INVALID_CONTEXT", "Percakapan dengan akun sendiri tidak didukung.");
    if (
      booking &&
      (!isId(booking.service_id) ||
        booking.customer_user_id !== row.customer_user_id ||
        booking.seller_profile_id !== row.seller_profile_id ||
        booking.service_id !== row.service_id)
    )
      fail("INVALID_CONTEXT", "Booking, layanan, dan peserta tidak cocok.");
    if (row.service_id) {
      const service = resolve(resolveService, row.service_id);
      if (
        service
          ? service.id !== row.service_id ||
            service.seller_profile_id !== row.seller_profile_id
          : !booking
      )
        fail(
          "INVALID_CONTEXT",
          "Layanan bukan milik Seller Profile ini atau sudah tidak tersedia.",
        );
    }
    return { row, profile, booking };
  }
  const participates = (conversation, user, profile) =>
    conversation.customer_user_id === user.id ||
    (profile.owner_user_id === user.id && user.sellerProfileId === profile.id);
  function authorized(data, conversationId, user) {
    const conversation = data.conversations.find(
      (row) => row.id === conversationId,
    );
    if (!conversation) denied();
    const profile = seller(conversation.seller_profile_id);
    if (!participates(conversation, user, profile)) denied();
    const { row } = context(
      {
        customer_user_id: conversation.customer_user_id,
        seller_profile_id: conversation.seller_profile_id,
        service_id: conversation.service_id,
        booking_id: conversation.booking_id,
      },
      user,
    );
    if (contextKey(row) !== contextKey(conversation))
      fail("INVALID_CONTEXT", "Konteks percakapan tidak cocok.");
    const participantIds = [
      conversation.customer_user_id,
      profile.owner_user_id,
    ];
    if (
      data.messages.some(
        (message) =>
          message.conversation_id === conversationId &&
          !participantIds.includes(message.sender_user_id),
      )
    )
      fail(
        "STORAGE_CORRUPT",
        "Pengirim pesan tersimpan bukan peserta percakapan.",
      );
    return { conversation, profile };
  }
  function notify(data, key, values, time) {
    const previous = data.notification_events.find(
      (event) => event.key === key,
    );
    if (previous)
      return data.notifications.find((row) => row.id === previous.entity_id);
    const notification = {
      id: id(data, "notification"),
      ...values,
      is_read: false,
      created_at: time,
    };
    data.notifications.push(notification);
    data.notification_events.push({ key, entity_id: notification.id });
    return notification;
  }
  function forUser(data, user) {
    return data.conversations
      .filter((row) => {
        if (row.customer_user_id === user.id) return true;
        const profile = seller(row.seller_profile_id);
        return participates(row, user, profile);
      })
      .map((row) => authorized(data, row.id, user).conversation);
  }
  function verifyNotification(data, notification, user) {
    if (notification.type !== "new_message") return;
    const message = data.messages.find(
      (row) => row.id === notification.related_entity_id,
    );
    const { conversation, profile } = authorized(
      data,
      message.conversation_id,
      user,
    );
    const recipient =
      message.sender_user_id === conversation.customer_user_id
        ? profile.owner_user_id
        : conversation.customer_user_id;
    if (notification.recipient_user_id !== recipient)
      fail(
        "STORAGE_CORRUPT",
        "Penerima notifikasi pesan tidak cocok dengan peserta percakapan.",
      );
  }
  const api = {
    subscribe(listener) {
      if (typeof listener !== "function")
        fail("INVALID_INPUT", "Subscriber harus berupa fungsi.");
      listeners.add(listener);
      let stop;
      try {
        stop = subscribeExternal?.(listener);
      } catch {
        listeners.delete(listener);
        fail(
          "DEPENDENCY_UNAVAILABLE",
          "Langganan perubahan data tidak tersedia.",
        );
      }
      return () => {
        listeners.delete(listener);
        stop?.();
      };
    },
    getOrCreateConversation(input) {
      const user = actor();
      const data = load();
      const { row, profile, booking } = context(input, user, true);
      if (!participates(row, user, profile)) denied();
      const previous = data.conversations.find(
        (item) => contextKey(item) === contextKey(row),
      );
      if (previous)
        return copy(authorized(data, previous.id, user).conversation);
      if (!booking && row.customer_user_id !== user.id)
        fail(
          "INVALID_CONTEXT",
          "Seller memerlukan booking terverifikasi untuk memulai percakapan baru.",
        );
      const time = timestamp();
      const conversation = {
        id: id(data, "conversation"),
        ...row,
        created_at: time,
        updated_at: time,
        last_message_at: null,
      };
      data.conversations.push(conversation);
      save(data);
      return copy(conversation);
    },
    listConversations() {
      const user = actor();
      const data = load();
      return forUser(data, user)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(copy);
    },
    getConversation(conversation_id) {
      const user = actor();
      return copy(authorized(load(), conversation_id, user).conversation);
    },
    listMessages(conversation_id) {
      const user = actor();
      const data = load();
      authorized(data, conversation_id, user);
      return data.messages
        .filter((row) => row.conversation_id === conversation_id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(copy);
    },
    sendMessage(conversation_id, content, options = {}) {
      const user = actor();
      requestKeys(options, ["client_event_id"]);
      const text = normalizeContent(content);
      const eventId = options.client_event_id;
      if (eventId !== undefined && !isId(eventId))
        fail("INVALID_INPUT", "ID permintaan pesan tidak valid.");
      const data = load();
      const { conversation, profile } = authorized(data, conversation_id, user);
      const requestKey = eventId
        ? JSON.stringify([user.id, conversation_id, eventId])
        : null;
      const prior =
        requestKey &&
        data.message_requests.find((row) => row.key === requestKey);
      if (prior) {
        const message = data.messages.find((row) => row.id === prior.entity_id);
        if (
          message.conversation_id !== conversation_id ||
          message.sender_user_id !== user.id ||
          message.content !== text
        )
          fail(
            "IDEMPOTENCY_CONFLICT",
            "ID permintaan sudah dipakai untuk pesan lain.",
          );
        return copy(message);
      }
      const time = timestamp(conversation.updated_at);
      const message = {
        id: id(data, "message"),
        conversation_id,
        sender_user_id: user.id,
        content: text,
        created_at: time,
        read_at: null,
      };
      data.messages.push(message);
      conversation.updated_at = time;
      conversation.last_message_at = time;
      if (requestKey)
        data.message_requests.push({ key: requestKey, entity_id: message.id });
      notify(
        data,
        JSON.stringify(["new_message", message.id]),
        {
          recipient_user_id:
            user.id === conversation.customer_user_id
              ? profile.owner_user_id
              : conversation.customer_user_id,
          actor_user_id: user.id,
          type: "new_message",
          title: "Pesan baru",
          message:
            "Ada pesan pengguna baru di Digarsa. Isi chat bukan instruksi atau bukti pembayaran tepercaya.",
          related_entity_id: message.id,
        },
        time,
      );
      save(data);
      return copy(message);
    },
    markConversationRead(conversation_id) {
      const user = actor();
      const data = load();
      const { conversation } = authorized(data, conversation_id, user);
      const time = timestamp(conversation.updated_at);
      const receivedIds = new Set();
      let changed = 0;
      for (const message of data.messages) {
        if (
          message.conversation_id === conversation_id &&
          message.sender_user_id !== user.id
        ) {
          receivedIds.add(message.id);
          if (message.read_at === null) {
            message.read_at = time;
            changed++;
          }
        }
      }
      let notificationChanged = false;
      for (const row of data.notifications)
        if (
          row.recipient_user_id === user.id &&
          row.type === "new_message" &&
          receivedIds.has(row.related_entity_id) &&
          !row.is_read
        ) {
          row.is_read = true;
          notificationChanged = true;
        }
      if (changed || notificationChanged) save(data);
      return { messages_marked_read: changed };
    },
    getUnreadCount(conversation_id = null) {
      const user = actor();
      const data = load();
      const ids = new Set(
        conversation_id
          ? [authorized(data, conversation_id, user).conversation.id]
          : forUser(data, user).map((row) => row.id),
      );
      return data.messages.filter(
        (row) =>
          ids.has(row.conversation_id) &&
          row.sender_user_id !== user.id &&
          row.read_at === null,
      ).length;
    },
    listNotifications() {
      const user = actor();
      const data = load();
      return data.notifications
        .filter((row) => row.recipient_user_id === user.id)
        .map((row) => {
          verifyNotification(data, row, user);
          return row;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(copy);
    },
    markNotificationRead(notification_id) {
      const user = actor();
      const data = load();
      const row = data.notifications.find(
        (item) =>
          item.id === notification_id && item.recipient_user_id === user.id,
      );
      if (!row) denied();
      verifyNotification(data, row, user);
      if (!row.is_read) {
        row.is_read = true;
        save(data);
      }
      return copy(row);
    },
    getUnreadNotificationCount() {
      return api.listNotifications().filter((row) => !row.is_read).length;
    },
    notifyBookingEvent(booking_id) {
      const user = actor();
      const data = load();
      if (!isId(booking_id)) fail("INVALID_INPUT", "ID booking tidak valid.");
      const { row, profile, booking } = context({ booking_id }, user, true);
      const type = {
        Requested: "booking_requested",
        Accepted: "booking_accepted",
        Declined: "booking_declined",
        Completed: "booking_completed",
      }[booking.status];
      if (!type)
        fail(
          "UNSUPPORTED_EVENT",
          "Status booking tidak menghasilkan notifikasi yang didukung.",
        );
      const customerEvent = type === "booking_requested";
      if (
        customerEvent
          ? user.id !== row.customer_user_id
          : user.id !== profile.owner_user_id ||
            user.sellerProfileId !== profile.id
      )
        denied();
      const recipient_user_id = customerEvent
        ? profile.owner_user_id
        : row.customer_user_id;
      const key = JSON.stringify([type, booking_id, recipient_user_id]);
      const existing = data.notification_events.find(
        (item) => item.key === key,
      );
      if (existing)
        return copy(
          data.notifications.find((item) => item.id === existing.entity_id),
        );
      const notification = notify(
        data,
        key,
        {
          recipient_user_id,
          actor_user_id: user.id,
          type,
          title: {
            Requested: "Permintaan booking baru",
            Accepted: "Booking diterima",
            Declined: "Booking ditolak",
            Completed: "Booking selesai",
          }[booking.status],
          message:
            "Status booking diperbarui pada data demo Digarsa. Notifikasi ini tidak memproses atau membuktikan pembayaran.",
          related_entity_id: booking_id,
        },
        timestamp(),
      );
      save(data);
      return copy(notification);
    },
    notifyReviewEvent(review_id) {
      const user = actor();
      const data = load();
      if (!isId(review_id)) fail("INVALID_INPUT", "ID ulasan tidak valid.");
      const review = resolve(resolveReview, review_id);
      if (
        !review ||
        review.id !== review_id ||
        review.customer_user_id !== user.id
      )
        denied();
      const { row, profile, booking } = context(
        {
          booking_id: review.booking_id,
          customer_user_id: review.customer_user_id,
          seller_profile_id: review.seller_profile_id,
        },
        user,
      );
      if (
        !booking ||
        booking.status !== "Completed" ||
        row.customer_user_id !== user.id
      )
        fail(
          "INVALID_CONTEXT",
          "Ulasan harus berasal dari booking selesai milik akunmu.",
        );
      const key = JSON.stringify([
        "new_review",
        review_id,
        profile.owner_user_id,
      ]);
      const existing = data.notification_events.find(
        (item) => item.key === key,
      );
      if (existing)
        return copy(
          data.notifications.find((item) => item.id === existing.entity_id),
        );
      const notification = notify(
        data,
        key,
        {
          recipient_user_id: profile.owner_user_id,
          actor_user_id: user.id,
          type: "new_review",
          title: "Ulasan baru",
          message:
            "Pelanggan memberi ulasan untuk booking yang selesai di Digarsa.",
          related_entity_id: review_id,
        },
        timestamp(),
      );
      save(data);
      return copy(notification);
    },
  };
  return api;
}

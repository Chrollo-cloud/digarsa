export const MESSAGING_KEY = "digarsa.demo.messaging.v1";
export const notificationTypes = Object.freeze([
  "new_message",
  "booking_requested",
  "booking_accepted",
  "booking_declined",
  "booking_completed",
  "new_review",
]);
export const fields = Object.freeze({
  conversation: [
    "id",
    "customer_user_id",
    "seller_profile_id",
    "service_id",
    "booking_id",
    "created_at",
    "updated_at",
    "last_message_at",
  ],
  message: [
    "id",
    "conversation_id",
    "sender_user_id",
    "content",
    "created_at",
    "read_at",
  ],
  notification: [
    "id",
    "recipient_user_id",
    "actor_user_id",
    "type",
    "title",
    "message",
    "related_entity_id",
    "is_read",
    "created_at",
  ],
});
export class MessagingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MessagingError";
    this.code = code;
  }
}
export const fail = (code, message) => {
  throw new MessagingError(code, message);
};
export const isId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(value);
export const isTime = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const nullableId = (value) => value === null || isId(value);
export const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export const contextKey = (row) =>
  JSON.stringify([
    row.customer_user_id,
    row.seller_profile_id,
    row.service_id,
    row.booking_id,
  ]);
const validContent = (value) =>
  typeof value === "string" &&
  value.length <= 4000 &&
  value.trim() === value &&
  value.replace(/[\s\u200B-\u200D\uFEFF]/g, "").length > 0 &&
  !Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return (
      code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
    );
  });
export function normalizeContent(value) {
  if (typeof value !== "string" || !validContent(value.trim()))
    fail("INVALID_INPUT", "Pesan harus berisi 1–4000 karakter yang valid.");
  return value.trim();
}
export function messageSafety(content) {
  return {
    is_trusted_payment_instruction: false,
    off_platform_payment_suspected:
      /(?:transfer|bayar|payment|pay|rekening|bank|wallet|whatsapp|wa\.me).{0,100}(?:langsung|di luar|diluar|outside|direct|pribadi|personal|\d{6,}|wa\.me)|(?:di luar|diluar|outside).{0,80}(?:bayar|payment|pay|transfer)/isu.test(
        String(content),
      ),
    advisory:
      "Pesan pengguna bukan instruksi pembayaran tepercaya atau bukti pembayaran. Jangan lakukan pembayaran di luar alur resmi Digarsa.",
  };
}
export const emptyEnvelope = () => ({
  version: 1,
  conversations: [],
  messages: [],
  notifications: [],
  notification_events: [],
  message_requests: [],
});

export function validateEnvelope(db) {
  const invalid = () =>
    fail(
      "STORAGE_CORRUPT",
      "Data pesan demo rusak atau tidak kompatibel. Data tidak ditimpa; periksa atau pulihkan penyimpanan browser.",
    );
  if (
    !exactKeys(db, Object.keys(emptyEnvelope())) ||
    db.version !== 1 ||
    [
      "conversations",
      "messages",
      "notifications",
      "notification_events",
      "message_requests",
    ].some((key) => !Array.isArray(db[key]))
  )
    invalid();
  const ids = new Set();
  const contexts = new Set();
  const unique = (id) => {
    if (!isId(id) || ids.has(id)) invalid();
    ids.add(id);
  };
  for (const row of db.conversations) {
    if (
      !exactKeys(row, fields.conversation) ||
      !isId(row.customer_user_id) ||
      !isId(row.seller_profile_id) ||
      !nullableId(row.service_id) ||
      !nullableId(row.booking_id) ||
      !isTime(row.created_at) ||
      !isTime(row.updated_at) ||
      row.updated_at < row.created_at ||
      (row.last_message_at !== null &&
        (!isTime(row.last_message_at) ||
          row.last_message_at < row.created_at ||
          row.last_message_at > row.updated_at))
    )
      invalid();
    unique(row.id);
    const key = contextKey(row);
    if (contexts.has(key)) invalid();
    contexts.add(key);
  }
  const conversations = new Map(db.conversations.map((row) => [row.id, row]));
  for (const row of db.messages) {
    const conversation = row && conversations.get(row.conversation_id);
    if (
      !exactKeys(row, fields.message) ||
      !conversation ||
      !isId(row.sender_user_id) ||
      !validContent(row.content) ||
      !isTime(row.created_at) ||
      row.created_at < conversation.created_at ||
      row.created_at > conversation.updated_at ||
      (row.read_at !== null &&
        (!isTime(row.read_at) || row.read_at < row.created_at))
    )
      invalid();
    unique(row.id);
  }
  for (const conversation of db.conversations) {
    const times = db.messages
      .filter((row) => row.conversation_id === conversation.id)
      .map((row) => row.created_at)
      .sort();
    if ((times.at(-1) || null) !== conversation.last_message_at) invalid();
  }
  for (const row of db.notifications) {
    if (
      !exactKeys(row, fields.notification) ||
      !isId(row.recipient_user_id) ||
      !nullableId(row.actor_user_id) ||
      !notificationTypes.includes(row.type) ||
      !nullableId(row.related_entity_id) ||
      typeof row.is_read !== "boolean" ||
      !isTime(row.created_at) ||
      !["title", "message"].every(
        (key) =>
          typeof row[key] === "string" &&
          row[key].trim() &&
          row[key].length <= 1000,
      )
    )
      invalid();
    unique(row.id);
    if (row.type === "new_message") {
      const message = db.messages.find(
        (item) => item.id === row.related_entity_id,
      );
      const conversation =
        message && conversations.get(message.conversation_id);
      if (
        !message ||
        row.actor_user_id !== message.sender_user_id ||
        row.recipient_user_id === row.actor_user_id ||
        (message.sender_user_id !== conversation.customer_user_id &&
          row.recipient_user_id !== conversation.customer_user_id)
      )
        invalid();
    }
  }
  for (const [key, records] of [
    ["notification_events", db.notifications],
    ["message_requests", db.messages],
  ]) {
    const keys = new Set();
    for (const row of db[key]) {
      if (
        !exactKeys(row, ["key", "entity_id"]) ||
        typeof row.key !== "string" ||
        !row.key ||
        row.key.length > 1000 ||
        keys.has(row.key) ||
        !records.some((record) => record.id === row.entity_id)
      )
        invalid();
      let tuple;
      try {
        tuple = JSON.parse(row.key);
      } catch {
        invalid();
      }
      const entity = records.find((record) => record.id === row.entity_id);
      if (!Array.isArray(tuple) || JSON.stringify(tuple) !== row.key) invalid();
      if (key === "notification_events") {
        const expected =
          entity.type === "new_message"
            ? [entity.type, entity.related_entity_id]
            : [entity.type, entity.related_entity_id, entity.recipient_user_id];
        if (JSON.stringify(expected) !== row.key) invalid();
      } else if (
        tuple.length !== 3 ||
        tuple[0] !== entity.sender_user_id ||
        tuple[1] !== entity.conversation_id ||
        !isId(tuple[2])
      )
        invalid();
      keys.add(row.key);
    }
  }
  return db;
}

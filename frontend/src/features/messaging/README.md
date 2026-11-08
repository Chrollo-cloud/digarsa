# Shared messaging and notification foundation

Customer and seller consumers use the **same** `messagingStore` exported from
`messagingClient.js`. This milestone adds no screens, route/provider changes,
booking hooks, payment actions, or changes to existing stores.

## Public records

All identifiers are stable strings. Timestamps are canonical ISO 8601 UTC strings.
Fields below are the complete record contracts; no camelCase aliases are stored.

```text
Conversation {
  id: string
  customer_user_id: string
  seller_profile_id: string
  service_id: string | null
  booking_id: string | null
  created_at: timestamp
  updated_at: timestamp
  last_message_at: timestamp | null
}

Message {
  id: string
  conversation_id: string
  sender_user_id: string
  content: string
  created_at: timestamp
  read_at: timestamp | null
}

Notification {
  id: string
  recipient_user_id: string
  actor_user_id: string | null
  type: NotificationType
  title: string
  message: string
  related_entity_id: string | null
  is_read: boolean
  created_at: timestamp
}
```

`NotificationType`: `new_message`, `booking_requested`, `booking_accepted`,
`booking_declined`, `booking_completed`, or `new_review`.
`related_entity_id` identifies a message, booking, or review, according to type.

## Consumer API

All methods are synchronous. They return the indicated value or throw a
`MessagingError` with a stable `code` and an Indonesian display `message`.
Returned records are copies. Consumers must catch errors, avoid showing stale
private data after account switching, and re-read on subscription callbacks.

| Method | Return / behavior |
| --- | --- |
| `getOrCreateConversation(context)` | Conversation; accepts only `customer_user_id`, `seller_profile_id`, `service_id`, `booking_id`. Optional nullable context fields default to null. Booking context supplies its verified participants and service. Without a booking, customer defaults to the signed-in account. |
| `listConversations()` | Authorized conversations, latest activity first. |
| `getConversation(conversation_id)` | Authorized Conversation. |
| `listMessages(conversation_id)` | Authorized Messages, chronological; insertion order breaks equal-timestamp ties. |
| `sendMessage(conversation_id, content, { client_event_id } = {})` | Message; derives sender/recipient from session and ownership. Creates the recipient notification atomically with the message. |
| `markConversationRead(conversation_id)` | `{ messages_marked_read: number }`; only incoming messages and their recipient's associated message notifications are marked read. Existing read timestamps are retained. |
| `getUnreadCount(conversation_id = null)` | Incoming unread message count for the authorized conversation or all of the account's conversations. |
| `listNotifications()` | Current recipient's notifications, newest first. |
| `markNotificationRead(notification_id)` | Updated Notification; does not implicitly read its message. |
| `getUnreadNotificationCount()` | Current recipient's unread notification count. |
| `notifyBookingEvent(booking_id)` | Notification derived from the booking's current authoritative status; deduplicated. |
| `notifyReviewEvent(review_id)` | Notification from an authoritative review and matching completed booking; requires the optional review resolver. |
| `subscribe(listener)` | Unsubscribe function; signals writes and external account, booking, and browser storage changes. |

```js
import { messagingStore, MessagingError, messageSafety } from './messagingClient';

try {
  // Buyer: actual persisted Seller Profile ID, not its owner's account ID.
  const conversation = messagingStore.getOrCreateConversation({
    seller_profile_id: sellerProfile.id,
    service_id: service.id,
  });
  const sent = messagingStore.sendMessage(conversation.id, 'Halo, boleh diskusi?', {
    client_event_id: crypto.randomUUID(), // Retain this ID across retries.
  });
  const safety = messageSafety(sent.content);
  // Render content as plain text. Every message is untrusted payment information.
  console.log(safety.is_trusted_payment_instruction); // always false

  // Seller uses the same API, signed into the actual owning account.
  // getOrCreateConversation({ booking_id }) also resolves a verified booking context.
} catch (error) {
  if (error instanceof MessagingError) console.error(error.code, error.message);
  else throw error;
}
```

Error codes: `UNAUTHENTICATED`, `SESSION_UNAVAILABLE`,
`NOT_FOUND_OR_FORBIDDEN`, `INVALID_INPUT`, `INVALID_CONTEXT`,
`IDEMPOTENCY_CONFLICT`, `STORAGE_CORRUPT`,
`STORAGE_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`, `INVALID_DEPENDENCY`,
`UNSUPPORTED_EVENT`, and `ID_COLLISION`. Unauthorized IDs share one error code
to avoid distinguishing nonexistent private records from other accounts' data.

## Authorization and contexts

- Every data operation obtains the current account afresh. Caller-supplied sender,
  recipient, or permission fields are rejected. Admin permission gives no chat bypass.
- Access requires the conversation's customer account or the current owner of its
  Seller Profile, with the same profile association on the signed-in account.
  A Seller Profile ID is never treated as an account ID.
- The account can buy in one conversation and sell in another. No separate account,
  role selector, or customer/seller messaging database is introduced.
- Service ownership and booking customer/seller/service relationships are verified.
  A verified historical booking can retain context after a service is removed.
- The unique context is `(customer_user_id, seller_profile_id, service_id, booking_id)`.
  Repeated requests reuse it. Different booking IDs stay separate; general enquiries
  and service enquiries are distinct. Sellers can reopen existing conversations;
  initiating one for a customer requires a verified booking.
- Message text is trimmed and must contain visible content, at most 4,000 UTF-16
  code units, without unsupported control characters. Retry IDs are scoped to sender
  and conversation; reusing one with different content fails rather than overwriting.

## Notification integration

Sending a message automatically creates a generic `new_message` notification for
the opposite participant. Notification text never promotes user-authored payment
instructions. `messageSafety` flags common off-platform solicitation patterns and
always labels messages untrusted; its heuristic is not a security guarantee.
UI consumers must render messages as plain text and present an appropriate advisory.
Messages and notifications never update booking/payment status.

Future booking consumers should call `notifyBookingEvent(booking.id)` **after** a
successful booking write. The method reads the live record, accepts Requested from
its customer or Accepted/Declined/Completed from its owning seller, and determines
the recipient itself. Paid/Cancelled have no supported notification event. No
generic method accepts arbitrary notification recipients or arbitrary event types.
Deduplication uses event type + booking/review ID + recipient (message ID for chat).
These calls are not yet wired into existing booking UI, as this phase is logic only.

`new_review` is supported by the factory through `resolveReview`; the bound client
does not provide it because the application has no authoritative review repository.
It fails with `UNSUPPORTED_EVENT` until that integration exists. Editorial mock
creators without a persisted, owned Seller Profile cannot receive messages yet.

## Storage and dependency boundary

`digarsa.demo.messaging.v1` contains a version-1 envelope with `conversations`,
`messages`, `notifications`, and private `notification_events` / `message_requests`
deduplication indexes. Index entries are `{ key, entity_id }`; they are not public
model fields. Missing storage starts empty without a write. Invalid JSON, versions,
fields, IDs, foreign keys, timestamps, or indexes fail closed. Damaged storage is
never silently replaced. Recovery requires explicit inspection/export and a separate
user-authorized reset; this API provides no destructive recovery method.

Writes validate the whole envelope before one `setItem`; read/quota failures surface
as errors without partial message/notification writes. UUID IDs persist across reloads.
Indexes currently grow with the dataset; retention/migration is a future concern.

`createMessagingStore` injects `storage`, `currentUser`, `resolveSellerProfile`,
`resolveService`, and `resolveBooking`; optionally `resolveReview`, `randomId`, `now`,
and `subscribeExternal`. All are synchronous. Resolver shapes:

```text
currentUser() => existing Phase 5 account or null
resolveSellerProfile(id) => { id, owner_user_id } | null
resolveService(id) => { id, seller_profile_id } | null
resolveBooking(id) => { id, customer_user_id, seller_profile_id, service_id, status } | null
resolveReview(id) => { id, customer_user_id, seller_profile_id, booking_id } | null
```

`adapters.js` translates existing camelCase account/catalog/booking models at this
boundary and uses the existing account-scoped booking views. Original stores and
account IDs remain unchanged. The client observes existing account/booking events
and same-browser storage events; it installs no new account provider.

**Demo limitation:** localStorage is editable by the browser user. These checks are
demo business rules, not production authorization or secure authentication. Storage
events provide same-browser awareness, not cross-device synchronization. Concurrent
tabs can race with last-writer-wins behavior; there is no transactional server,
delivery guarantee, encryption, or production payment verification.

## Files and verification

- `contracts.js`: exact schemas, validation, errors, content/safety helpers.
- `messagingStore.js`: shared repository and business rules.
- `adapters.js`: existing account/service/booking model bridge.
- `messagingClient.js`: ready-to-import demo singleton.
- `frontend/tests/messaging.test.js`: unit and real Phase 5/6 adapter integration coverage.

Run `npm run lint`, `npm run build`, and `npm test` from `frontend`.
No messaging UI exists to browser-test in this phase.

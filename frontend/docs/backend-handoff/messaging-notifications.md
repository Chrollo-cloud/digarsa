# Shared messaging and notifications

## Confirmed contracts

Source: [contracts.js](../../src/features/messaging/contracts.js), [messagingStore.js](../../src/features/messaging/messagingStore.js). These are complete exact public record keys, not suggested aliases. Nullable fields must still be present.

```text
Conversation {
  id: ID,
  customer_user_id: ID,
  seller_profile_id: ID,
  service_id: ID | null,
  booking_id: ID | null,
  created_at: ISO_UTC,
  updated_at: ISO_UTC,
  last_message_at: ISO_UTC | null
}
Message {
  id: ID,
  conversation_id: ID,
  sender_user_id: ID,
  content: string,
  created_at: ISO_UTC,
  read_at: ISO_UTC | null
}
Notification {
  id: ID,
  recipient_user_id: ID,
  actor_user_id: ID | null,
  type: NotificationType,
  title: string,
  message: string,
  related_entity_id: ID | null,
  is_read: boolean,
  created_at: ISO_UTC
}
```

ID is a stable alphanumeric-first, alphanumeric/underscore/hyphen string, 1–200 characters. Dates are canonical ISO UTC. Message content is trimmed, visible, 1–4000 UTF-16 code units, not zero-width/whitespace-only; unsupported control characters rejected (tab/newline/CR allowed). Notification title/message each have nonempty text ≤1000. Supported types exactly: `new_message`, `booking_requested`, `booking_accepted`, `booking_declined`, `booking_completed`, `new_review`. No Paid, Cancelled, payout, email or push event contract exists.

## API surface (current synchronous demo)

| Shared method | Return and behavior |
| --- | --- |
| `getOrCreateConversation(context)` | Stable Conversation; allowed keys customer_user_id, seller_profile_id, service_id, booking_id; missing optional context defaults null |
| `listConversations()` | Participating conversations, updated_at descending |
| `getConversation(id)` | Authorized Conversation copy |
| `listMessages(id)` | Authorized Message copies, created_at ascending; insertion order breaks equal timestamps |
| `sendMessage(id,content,{client_event_id}={})` | Session-derived sender Message; retry key optional, unknown option fields rejected |
| `markConversationRead(id)` | `{messages_marked_read}`; incoming messages plus their related recipient message notices |
| `getUnreadCount(id=null)` | Incoming unread for conversation or all authorized participant contexts |
| `listNotifications()` | Current recipient's records, newest first |
| `markNotificationRead(id)` | Owned notice updated; does not itself read a message |
| `getUnreadNotificationCount()` | Current recipient unread notices across shared contexts |
| `notifyBookingEvent(booking_id)` | Derives event/actor/recipient from authorized booking, deduplicated |
| `notifyReviewEvent(review_id)` | Derives from authoritative review + owned Completed context, deduplicated |
| `subscribe(listener)` | Signals committed writes and external account/booking/browser storage changes; returns unsubscribe |

Methods return copied records or throw `MessagingError` with code and Indonesian message. Codes include UNAUTHENTICATED, SESSION_UNAVAILABLE, NOT_FOUND_OR_FORBIDDEN, INVALID_INPUT, INVALID_CONTEXT, IDEMPOTENCY_CONFLICT, STORAGE_CORRUPT, STORAGE_UNAVAILABLE, DEPENDENCY_UNAVAILABLE, INVALID_DEPENDENCY, UNSUPPORTED_EVENT, ID_COLLISION. Never convert failures to zero unread.

## Ownership and role views

[adapters.js](../../src/features/messaging/adapters.js) resolves account/session, Seller Profile `{id,owner_user_id}`, service `{id,seller_profile_id}` and authorized booking `{id,customer_user_id,seller_profile_id,service_id,status}`. The account ID and seller profile ID are different identities. Shared access is customer participant OR current actual profile owner with matching account profile association. Admin permission alone grants no chat access. Service/booking associations must match. Self-messaging is forbidden.

Canonical unique context is `(customer_user_id,seller_profile_id,service_id,booking_id)`, with nulls included in equality. General enquiry, service enquiry and each genuinely different booking context remain separate; retries for the same context reuse ID. A seller can access an existing authorized service enquiry but can initiate a new customer conversation only through a verified owned booking. Historical booking context can survive service removal; a new orphaned service context cannot be fabricated.

[customerMessaging.js](../../src/features/messaging/customerMessaging.js) further requires customer_user_id=current account for its inbox/thread/send/read/start methods. [sellerMessaging.js](../../src/features/seller/sellerMessaging.js) requires seller_profile_id=current owned profile and resolves customer name/avatar only for its authorized conversations. A dual-capability account may use both views without mixing unread badges or drafts. Both use [messagingClient.js](../../src/features/messaging/messagingClient.js), not separate stores.

**Integration risk:** existing adapters find profiles through `listSellerProfiles()` and return owner IDs, unlike the stronger account-backed `getBookableSeller()` proof used in booking/Nearby. Backend must resolve a real owner FK, reciprocal association and valid service/booking relationships; it cannot trust a browser profile containing an owner string. Corrupt/orphan dependencies should fail closed, not synthesize an owner.

## Delivery, deduplication and receipts

| Event | Actor check | Recipient | related_entity_id | Private dedup identity |
| --- | --- | --- | --- | --- |
| new_message | Authorized sender participant | Opposite participant account | Message ID | `(new_message,message_id)` |
| booking_requested | Current owning customer, status Requested | Real seller owner account | Booking ID | `(type,booking_id,recipient_user_id)` |
| booking_accepted / booking_declined / booking_completed | Owning seller, matching current status | Booking customer | Booking ID | `(type,booking_id,recipient_user_id)` |
| new_review | Review author + verified matching Completed booking | Real seller owner account | Review ID | `(new_review,review_id,recipient_user_id)` |

Sending writes Message, conversation activity timestamps, recipient notice and optional retry index in one messaging-envelope write. `client_event_id` is scoped by sender+conversation; same key/content returns the same Message, mismatched content fails. Without a retained key, repeated sends can duplicate. Timestamp rollback is clamped against conversation activity to preserve chronology. Identifiers survive reload.

`markConversationRead` touches incoming unread only, retains existing receipts, reads associated new-message notices, and does not bump conversation activity. Marking a notice alone never implies its message was seen. The thread only marks read while document is visible and user is near the history end; controlled scrolling avoids dragging readers away from older messages. Enter sends, Shift+Enter adds a line, IME composition is respected; drafts/retry state reset on account/thread changes.

Customer notices are filtered to authorized buyer chat/bookings before destinations are constructed. Seller notices show owned messages, booking_requested and new_review; review links go to current seller public profile. No arbitrary URL is trusted from notification text. Bell shows at most eight recent customer notices, All/Unread and View All; full centers use the same states.

Booking creation calls requested delivery after successful save. [bookingNotificationBridge.js](../../src/features/messaging/bookingNotificationBridge.js) observes seller Accepted/Declined/Completed changes, not historical states merely on login; it has no durable outbox. [reviewActions.js](../../src/features/reviews/reviewActions.js) reports a saved review even if notification fails and offers retry. Editing does not notify again. These cross-store operations are not atomic; observers may miss events across tabs/offline sessions.

## Persistence and Proposed server replacement

`digarsa.demo.messaging.v1` contains version 1 arrays conversations/messages/notifications plus internal `notification_events` and `message_requests` entries `{key,entity_id}`. Strict envelope/record/ID/association/timestamp/index checks reject corruption without overwrite. Missing storage starts empty; quota/read errors surface. It is one browser-local repository, not encrypted trusted messaging, database transactions or cross-device delivery. Internal indexes are not new public fields and currently have unbounded retention.

**Proposed:** server authorization and null-safe unique context constraint; stable cursor pagination with created_at+ID tie-breakers; message transaction + request key + outbox; booking/review transactions produce uniquely keyed events. Disable browser event writers when backend becomes authoritative, or duplicate/misordered events can arise. Use a read watermark on the proposed read command to avoid marking concurrently arrived unseen messages. No user-supplied recipients/event types endpoint.

**Needs confirmation:** polling, SSE or WebSocket for authorized invalidation/new-message events. No technology exists today; choose based on deployment. Authenticate subscriptions, recheck permissions, prevent cross-account event leakage, reconnect with cursors, deduplicate by stable entity/event IDs, keep REST authoritative and fallback to bounded polling. Typing, online presence, attachments, delivery guarantees and multi-device receipt policy are not existing features.

Render text as text. `messageSafety()` always sets `is_trusted_payment_instruction:false` and heuristically flags off-platform solicitation; it is advisory, not authoritative moderation or payment confirmation. Server notifications should use generic trusted copy, not promote user payment requests.

Coverage: [messaging.test.js](../../tests/messaging.test.js), [customer-messaging.test.js](../../tests/customer-messaging.test.js), [seller-messaging.test.js](../../tests/seller-messaging.test.js), [reviews.test.js](../../tests/reviews.test.js). Preserve shared signatures and role-isolation tests while adapting async transport.

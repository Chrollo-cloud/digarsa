# Customer messaging and notifications

Implemented on `feature/customer-messaging`, starting from foundation commit
`e9ecff0`. The redesigned messaging workspace retains the prototype's paper,
indigo/aqua palette and editorial typography, using a 1280px maximum shell with
a 32/68 desktop split (36/64 on tablet). The shared navbar is unchanged.
No dedicated notification view was found in the prototype; the notification
center follows the same visual system. No prototype source was copied.

## Routes and access

- `/messages`: buyer conversations only, sorted by the shared store's activity
  ordering, with creator identity, service, context label, preview and unread count.
- `/messages/:conversationId`: shared authorization **plus** matching customer ID;
  owning the seller profile alone does not grant access through this customer UI.
- `/notifications`: current recipient's shared notifications. Links are constructed
  only from verified customer conversations or owned bookings, never arbitrary text.
  Seller-side notices can be read here but have no customer-thread destination.

All routes sit under the existing `RequireAccount`. Safe return validation now
recognizes nested conversation IDs and `/notifications`, preserving query/hash.
Service chat returns guests to the service after login; they press Chat Kreator
again to start. Fictional creators without persisted Seller Profile owners and
self-contact are explicitly disabled. Booking contact checks customer ownership
before creating a context. Distinct booking and service conversations stay separate.

## Data and interactions

`customerMessaging.js` is a stateless consumer facade, not another store. It calls
the existing singleton for every read, send, read-state change and notification.
Account identity is re-read on every operation. `useMessaging` invalidates views
on shared subscriptions and account changes without caching private records.
The thread remounts per account/conversation, clearing drafts and retry state.

The composer renders plain text; Enter sends and Shift+Enter inserts a newline.
Composition events are excluded from Enter submission. Compact bubbles size to
their content, group under local date separators, and show only stored read state.
A retained request ID prevents duplicate sends on retries. Automatic scrolling is
limited to the history panel on initial entry, a send, or when near its end. Users
reading older messages can jump to the latest. Incoming messages are marked read
only with the document visible and the history near its end. Marking a notification
alone does not imply reading the corresponding message. Payment advisories remain
visible and suspicious solicitation gets an additional warning.

Desktop inbox/search stays visible while a selected chat changes on the right.
Search matches creator name, service or preview without changing stored records.
At 700px and below, inbox and chat become separate panels with exactly one Back
control in the active chat, including error states. The workspace fills the mobile
visual viewport below the existing navbar; the site footer is hidden only in this
mobile messaging layout. Visual viewport resize events keep the composer within
the available height. Real iOS/Android keyboard behavior still needs device QA.

Pages have lazy-loading, empty and error states. Errors never clear or repair
damaged localStorage automatically. Navigation badges show unavailable data rather
than claiming zero unread items when a read fails.

## Booking notifications

Customer confirmation emits `booking_requested` after a successful booking write.
A notification failure does not undo the booking; the destination shows a warning.
Editorial bookings without owned seller profiles do not fabricate recipients.

`bookingNotificationBridge.js`, mounted once by `BookingNotifications.jsx`, observes
successful writes through the existing account-scoped seller booking view. It emits
Accepted, Declined and Completed events only on observed status changes by the
signed-in owning seller. The foundation independently verifies the actor/context
and deduplicates these notifications. It does not notify old states merely on login,
does not emit Paid events, and never changes a booking or simulates payment.
No Seller Center, seller-order, Admin Dashboard, or booking-store code was changed.
Background bridge notification failures produce a console warning without changing
the successful booking result. There is no durable retry/outbox in this demo.

## Files

New files under `frontend/src/features/messaging/`:

- `customerMessaging.js`, `customerMessagingClient.js`: scoped consumer facade/binding.
- `useMessaging.js`: subscription/error handling hook.
- `MessagingFrame.jsx`, `MessagingState.jsx`, `messaging.css`: shared presentation.
- `InboxPage.jsx`, `ConversationPage.jsx`, `NotificationsPage.jsx`: customer routes.
- `MessagingWorkspace.jsx`, `ConversationThread.jsx`, `workspace.css`: redesigned
  messaging presentation, independent inbox/history scrolling, responsive panels.
- `ContactCreator.jsx`: service and booking conversation entry.
- `bookingNotificationBridge.js`, `BookingNotifications.jsx`: event integration.
- `CUSTOMER_UI.md`: this integration guide.

New tests: `frontend/tests/customer-messaging.test.js`.

Existing files changed:

- `frontend/src/App.jsx`: protected routes, lazy loading, one event bridge.
- `frontend/src/features/account/AccountMenu.jsx`: messages/notifications links/counts.
- `frontend/src/features/account/redirects.js`: allowed messaging return paths.
- `frontend/src/features/customer/CustomerFrame.jsx`: customer navigation links.
- `frontend/src/features/customer/BookingRequestPage.jsx`: requested event after save.
- `frontend/src/features/customer/BookingDetailPage.jsx`: contact action/error notice.
- `frontend/src/pages/marketplace/ServiceDetailPage.jsx`: real contact action.
- `frontend/src/features/messaging/README.md`: link to this milestone guide.

## Verification and limits

Automated tests cover customer-only visibility, dual buyer/seller roles, ownership,
context creation/deduplication, switching accounts, notification links/isolation,
unread/read state, malformed/unavailable storage, redirects and booking event wiring.

Verification completed: `npm run lint` and `npm run build` pass; `npm test` passes
all 92 tests (14 added for this milestone). Browser checks at 1440, 1024, 768 and
390px found no horizontal overflow in inbox, thread or notifications. Verified
service/booking starts, safe login return, persistence after reload, keyboard send,
self-contact denial, seller exclusion from customer threads, account switching,
booking acceptance notification delivery, mark-as-read and owned-booking navigation.
Mobile navigation opens by keyboard and closes with Escape. Browser tests exercised
outgoing chat; incoming unread/read behavior was tested through the shared API.

Browser checks use synthetic `.test` accounts and local demo records. No data is
sent externally. LocalStorage remains user-editable demo persistence; it provides
neither production authorization nor cross-device synchronization. Concurrent tabs
retain the foundation's last-writer-wins limitation. Review event integration still
requires an authoritative review source.

**Seller Messaging:** no schema or shared API changes are required. Future seller UI
should consume `messagingClient.js`, enforce its seller context separately, and must
not reuse the customer-only facade for seller threads. There is no seller reply UI
in this milestone; incoming message behavior is covered by automated shared-store
tests. Notifications with no verified customer destination deliberately have no link.

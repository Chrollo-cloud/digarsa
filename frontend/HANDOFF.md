# Digarsa Phase H frontend handoff

This frontend continues to use the unified account model and existing customer, seller, messaging/notification, and review stores. Checkout and payment are demo flows over browser-local records; localStorage is not a database, does not provide cross-device synchronization, and is not a security boundary.

## Existing architecture reused

- `src/features/account/demoStore.js` remains the account/session authority. A seller is a capability attached to a normal buyer account through an owned Seller Profile; registration cannot grant seller or admin permission.
- `src/features/customer/customerStore.js` remains the single booking/cart/favorites store. Customer and Seller operations mutate the same booking records through existing clients and ownership checks.
- Seller service ownership and availability come from the seller catalog overlay and current marketplace catalog. Checkout revalidates availability and Seller Profile ownership in the store.
- `src/features/messaging/messagingStore.js`, its contracts/adapters, and the review store remain authoritative for shared notifications and verified review eligibility.

## Cart and multi-service checkout

`/cart` supports selecting eligible services, select all/deselect all, per-Seller grouping, an estimated subtotal, and visible warnings for unavailable records. Entries remain in the customer's existing account-scoped cart. An unavailable entry is not silently deleted. Self-booking and services without an eligible, real Seller Profile owner are rejected.

`/checkout?checkout=<opaque-id>` collects a requested date and brief for every selected service, validates all lines before mutation, and summarizes the selected Seller groups and estimated subtotal. Remote/asynchronous service lines also require a requested date in this multi-service flow. Submission creates one independent booking per service, including separate records for services from the same Seller. Sellers see only bookings for their owned Seller Profile; each Customer retains access only to their own records.

`submitCheckout(entries, { checkoutId, confirmed, expectedUserId })` validates the active session, selection, per-service details, availability and ownership. The optional `checkoutId` plus `checkoutServiceIds` tie the booking group together and allow retries to reuse previously persisted booking IDs. Repeated submission with the same account/context is idempotent. A changed selection or account is rejected. Since localStorage has no transactional or cross-tab compare-and-swap guarantee, a crash between writes can leave a partial group; retry can resume a verified partial group without duplicating saved rows. The UI reports persistence errors and does not claim database atomicity.

Single-service booking at `/booking/:serviceId` remains available. Legacy `/booking` redirects to `/orders`.

## Booking lifecycle and prices

The existing lifecycle remains `Requested → Accepted → Paid → Completed`, with `Declined` and `Cancelled` as terminal alternatives. Seller acceptance records a validated integer-Rupiah `finalPrice`; legacy accepted records can receive a one-time price only through the owning Seller action. The customer payment flow uses that exact accepted price. A Seller can complete work only after the record is Paid. Reviews remain restricted to valid, customer-owned Completed bookings.

New optional booking data:

- `checkoutId`: opaque checkout group identifier.
- `checkoutServiceIds`: selected service IDs recorded for retry-context validation.
- `finalPrice`: Seller-agreed integer Rupiah amount.
- `demoPayment`: simulation receipt `{ id, kind: "simulation", amount, paidAt }`.

These fields are validated when reading stored data. They do not replace existing booking identity, service, customer, Seller Profile, or lifecycle fields.

## Demo payment

`/payment/:bookingId` is available only for the authenticated Customer's Accepted booking and requires an explicit confirmation. `simulatePayment` rechecks ownership, status, exact accepted price, and current session before changing the shared booking record to Paid. It is enabled in Vite development or with `VITE_ENABLE_DEMO_PAYMENT=true`; this toggle only enables a clearly labeled local simulation. No card data, bank details, payment gateway, or money movement exists. This is not production payment authorization and must never be used as evidence of actual settlement.

For production, the backend must create payment intents and verify provider callbacks/webhooks server-side. Only a trusted backend event may mark a booking Paid. The server must enforce idempotency, amount/currency, booking ownership, replay protection, and reconciliation before enabling Paid → Completed.

## Notifications

The shared notification contract adds `booking_paid` for the explicitly simulated payment event. Existing `booking_requested`, `booking_accepted`, `booking_declined`, and `booking_completed` continue to use the shared store and deduplication by booking/event recipient. A payment event is emitted only when a booking has the validated `demoPayment` simulation marker. It does not prove real payment. Backend integration must define authoritative event IDs and deduplication semantics for these events.

## Password recovery

`/forgot-password` is informational and intentionally does not accept an email or expose account-existence information. There is no public browser reset API. The local utility in `dev/recover-account.js` is an offline development workflow: it consumes a chosen account-store backup and password/confirmation JSON via stdin, requires explicit target account ID/email and a confirmation flag, refuses Admin accounts, and writes a separate output file with restrictive permissions. It does not edit the running browser store or provide email delivery. Treat backups and stdin carefully; never commit them.

Production recovery requires a backend-issued, expiring, single-use recovery token or OTP, generic public responses, rate limits, audit events, and secure password hashing. Do not expose a privileged local recovery utility through a production route.

## Routes and permissions

`/checkout` and `/payment/:bookingId` require login and are protected by the existing account guard. Login return destinations remain restricted to supported internal routes, including nested Seller service availability paths; route permission checks still run after login. `/booking` redirects to `/orders`. Development-only Admin provisioning and Admin permission checks are unchanged; public registration cannot grant Admin permission.

## Backend integration contracts to update

The existing `frontend/docs/backend-handoff/` was not replaced. During backend integration, reconcile that handoff with these additions:

1. Multi-line checkout request/response and per-service booking representation; idempotency key and partial/retry semantics.
2. Optional `checkoutId`/service group fields or an equivalent server-side checkout relation.
3. Seller acceptance and final-price validation, including integer Rupiah/currency rules.
4. Server-owned payment intent and verified payment callback; frontend simulation receipts must not be accepted as proof.
5. `booking_paid` notification event and event ID/deduplication behavior.
6. Role/ownership checks on every Customer and Seller booking operation, including payment and completion.
7. Password recovery token/OTP endpoints and generic response policy.
8. Migration/compatibility validation for legacy bookings without checkout or final-price metadata.

## Demo testing

1. Register a normal Customer account. Activate a separate Seller account through Seller onboarding and publish eligible services.
2. Sign back in as Customer, add services from one or more Sellers, select multiple lines in `/cart`, and complete every date/brief field in `/checkout`.
3. Confirm each service creates its own Requested order. Sign in as the owning Seller, accept with a final price (or decline), and verify another Seller cannot see or mutate it.
4. As Customer, open the Accepted order and explicitly simulate payment. Confirm the same order becomes Paid, then as its Seller complete it. Submit a review as the Customer only after Completed.
5. Repeat checkout/payment actions to verify retry behavior and notification deduplication. Use separate accounts to check ownership boundaries.
6. Password recovery UI explains the development limitation. For a local offline recovery exercise, use a private backup and the explicit `node dev/recover-account.js ...` utility; do not use a live or shared account backup and never commit inputs/outputs.

Run `npm run lint`, `npm run build`, and `npm test` in this directory. Browser-local records are per browser profile and may be cleared by the user or browser storage policy.

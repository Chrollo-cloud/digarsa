# Phase 6: customer discovery and booking requests

The repository was verified before implementation: root
`/Users/chrollo/Documents/digarsa-logicodix`, branch `feature/customer-booking`,
clean working tree. Original prototype interfaces were read for visual reference;
no prototype source or new artwork was copied.

## Routes and behavior

- `/dashboard`: greeting, active requests, counts, recent booking activity, saved services.
- `/favorites`: saved marketplace cards; `/saved` redirects here for compatibility.
- `/cart`: consideration list with an individual booking action per available service.
- `/booking/:serviceId`: brief form, review/edit step, then explicit confirmation.
- `/orders`: owned bookings with status filtering.
- `/orders/:bookingId`: owned booking details and lifecycle tracking.

All private routes use the existing Phase 5 account guard. Seller accounts keep
buyer access. Guest favorite/cart controls direct to login and preserve a validated
return path; booking links pass through the same account guard. No action is
silently performed after login: the user can review the service and press again.

The new service controls are reused on marketplace cards, public creator cards,
favorites, the dashboard, and service details. Existing search/filter/sort/gallery
implementations are unchanged. The navbar's markup/styles and original logo are
unchanged; only account-menu destinations/future labels were updated.

## Data architecture

`customerStore.js` is an injected, framework-independent demo repository.
`customerClient.js` supplies browser storage, the Phase 5 session store, and the
shared marketplace entities. `useCustomer.js` subscribes to local writes, storage
events, and the authentication context.

Versioned localStorage key: `digarsa.demo.customer.v1`.

- `lists`: `{ userId, favorites: [serviceId], cart: [serviceId] }`.
- `bookings`: unique UUID-based ID, customer/service/creator IDs, immutable-at-creation
  service/creator names and estimated price, delivery mode, requested date, address,
  requirements, description, created-at timestamp, and status.

Owners are taken from the current session on every operation, never from form
inputs. Reads only expose that customer's records. Creation forces `Requested`,
requires confirmation from the reviewed user, and revalidates availability,
self-booking, delivery, dates, and brief text. A successful single localStorage write
saves the request and removes only its service from that user's consideration list.
There are no setters for acceptance, payment, completion, or cancellation.

Remote work has no address requirement; scheduling is optional unless explicitly
required by the listing. Onsite work requires a valid nonpast date and a full
address. Missing/unsupported delivery modes are unavailable, never inferred.

Malformed records are excluded safely and surfaced in a warning. If any records
are malformed, writes are blocked instead of silently overwriting existing data.
The user must inspect/recover local demo storage before continuing. Failed writes
retain the previous cart and bookings. Unknown cart services remain removable.
Favorites whose catalog service was removed are not rendered.

This is NOT server authorization. Device owners can modify browser storage;
permissions and statuses cannot be trusted in production. Concurrent writes from
different tabs are not transactional. There is no payment data or backend request.

## Validation

`tests/customer.test.js` covers account isolation, duplicate prevention, guest
mutations, remote/onsite/scheduled/unknown modes, dates, brief validation,
confirmation, self-booking, full-book restrictions, availability revalidation,
unique IDs, forced status/price/ownership, malformed data, write failures, lifecycle
reading, redirects, and integration with real Phase 5 demo account/session switching.

27 tests total passed, including the 10 existing Phase 5 tests. ESLint and the
production Vite build passed.

Browser checks: guest login return, save/cart, persistence after reload, review/edit
and confirmation, Remote without a date, Onsite required date/address on mobile,
Full-book restrictions, order filtering, cross-account denial, return after login,
marketplace search/sort/gallery, creator links, and mobile account navigation.
Dashboard, favorites, cart, booking form, orders, and booking detail were inspected
at 1440, 1024, 768, and 390px without page overflow or broken images. Browser
console error log was empty during the flow.

## Differences and deferred features

Uses the established paper/indigo/blue/aqua system, compact white bordered panels,
1120px customer shell, reference-style heading hierarchy and four-step timeline.
Existing replacement imagery and local service catalog remain. Order filtering
uses a compact select rather than the original prototype's richer tabs/search.
The cart intentionally has no bulk selection, quantities, aggregate price, or
combined checkout. No rendered pixel-diff comparison or dedicated Safari run was
performed in Phase 6.

Seller acceptance and management belong to Phase 7. Messaging, payments, checkout,
verified reviews, cancellation workflows, backend authorization, and cross-device
persistence remain deferred. Only Requested bookings can be created; other known
statuses are rendered solely if present in valid stored records.

## Exact implementation files

Added under `frontend/src/features/customer/`:
- BookingCard.jsx
- BookingDetailPage.jsx
- BookingRequestPage.jsx
- BookingSummary.jsx
- CartPage.jsx
- CustomerFrame.jsx
- DashboardPage.jsx
- EmptyState.jsx
- FavoritesPage.jsx
- OrdersPage.jsx
- ServiceActions.jsx
- customer.css
- customerClient.js
- customerStore.js
- formatters.js
- useCustomer.js
- README.md

Also added: `frontend/tests/customer.test.js`.

Modified:
- frontend/src/App.jsx
- frontend/src/components/marketplace/ServiceCard.jsx
- frontend/src/pages/marketplace/ServiceDetailPage.jsx
- frontend/src/features/account/AccountMenu.jsx
- frontend/src/features/account/redirects.js

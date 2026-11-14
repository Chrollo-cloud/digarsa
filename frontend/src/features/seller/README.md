# Phase 7: Seller Center + Admin Dashboard

Integrated on `integration/customer-seller` at baseline `32bde5e`. No new auth
system and no separate orders store.

## Reuse rules (agreed with the Customer owner)
- Auth/roles: Phase 5 `demoStore` only. Seller = owns a Seller Profile
  (`user.sellerProfileId`). Admin = `admin:access` permission, independent of seller.
- Orders: the SAME bookings in `digarsa.demo.customer.v1`. Seller reads/updates them
  through `customerStore.sellerView()` / `respondToBooking()`. Statuses are the
  existing ones (`Declined`, not `Rejected`).
  Lifecycle: Requested → Accepted → Paid → Completed. Sellers may accept or decline
  Requested bookings. Declined and Cancelled are alternative terminal outcomes.
  Checkout and real payment confirmation are not implemented: Accepted remains
  Accepted until a future legitimate payment flow records Paid. There is no demo
  payment action or automatic transition to Paid. Only an existing valid Paid booking
  can be completed by its owning seller; Accepted cannot directly become Completed.
  Extra optional booking fields: `updatedAt`, `declineReason`. A saved decline reason
  is shown in seller detail and in the owning customer's declined booking detail.

## Routes
Seller routes are nested under `/seller-dashboard` (`RequireSeller`): the overview,
`orders`, `orders/:id`, `services`, `services/new`, `services/:id/edit`,
`services/:id/availability`, `messages`, `messages/:id`, `notifications`, `earnings`,
and `profile`. For example, incoming orders use `/seller-dashboard/orders`.
Admin routes are nested under `/admin` (`RequireAdmin`): the overview, `moderation`,
`orders` (read-only), and `accounts` (read-only).

## Data
- `digarsa.demo.seller.v1`: seller-created services, availability slots + admin
  moderation flags. Services have an `active` publication flag separate from
  `Open` / `Full-book`; older records default to active when read.
- Availability slots are owner-scoped date/time ranges and reject overlaps for
  the same service. Customer bookings currently record a requested date, not a
  time, so seller slots are planning data and do not claim a booking time.
- `data/marketplace.js#syncCatalog` publishes seller profiles/services into the same
  `services`/`creators` arrays (in place) so marketplace, booking and cart read one catalog.
  Inactive or moderated services leave the catalog, so new bookings are refused;
  existing bookings continue.
- Deleting a service with Requested/Accepted/Paid bookings is refused.
- Earnings and performance are estimates from shared booking statuses and
  `estimatedPrice`; there are no transaction, payment, or payout records.
- Seller email is read-only. Seller phone edits use the existing shared account
  profile model and its validation.

## Shared files touched (additive; please review)
- `App.jsx`: two routes now mount `SellerCenter` / `AdminCenter`; one side-effect import.
- `AccountMenu.jsx`: removed "Segera hadir" for Seller Center and Admin.
- `demoStore.js`: added `updateSellerProfile`, `listSellerProfiles`, `customerNames`
  (seller/admin only), `listAccountsForAdmin` (admin only, no credentials).
- `customerStore.js`: added `sellerView`, `respondToBooking`, `adminView`, `sellerActions`.
- `data/marketplace.js`: added `syncCatalog`, `getBaseServices`.

## Testing an admin
There is no public UI or registration option to grant admin. Use the explicit
localhost development workflow in [the account README](../account/README.md#local-admin-demo-provisioning).
The tool targets the signed-in account by ID, never by email, and is excluded
from production builds.

This is a browser-storage demo, not server authorization.

## Phase B — Seller Center design

Seller pages use their own `SellerFrame`, with the existing global navbar/logo and
footer rendered once. A white sticky sidebar has seven existing route groups and
current-page indicators; at 640px and below it becomes a sticky, expandable inline
menu with `aria-expanded`, normal keyboard links, close-on-selection, and Escape.
Seller-only CSS applies the same white panels, compact cards, borders, and form
rhythm to orders, services, earnings, profile, notifications, and messaging.
Admin and Customer layouts/styles are unchanged. Messaging containers adapt to a
single panel below 900px without altering messaging components or contracts.

### Data and analytics

All values consume `useSeller`'s existing account-owned views. No new persistence,
permissions, statuses, payments, or backend integration is introduced.

- Incoming requests: status Requested.
- Active services: `active` and not moderated/hidden; Full-book remains active.
  The note separately counts active, Open, non-hidden services accepting booking.
- Accepted bookings: current status Accepted, explicitly described as unpaid.
- Completed bookings: current status Completed.
- Total bookings: every status in the seller-owned view.
- Completed estimate: sum of the original `estimatedPrice` for Completed records;
  never described as received revenue or a payment balance.

`aggregateBookingTrend` counts records by actual `createdAt`, in the browser's
local timezone: 7 or 30 calendar-day buckets through today, or 12 calendar-month
buckets through this month. Future timestamps, invalid dates, and records outside
the chosen window are excluded. Status changes and updatedAt never generate new
chart events. There is one honest request-count series, not fabricated sales,
visitors, historical completion events, or revenue curves. Zero-count buckets only
fill the requested calendar window; when the entire window is empty, the graph is
replaced with an explanatory empty state. Accessible data tables accompany the
SVG chart. Recent activity sorts by updatedAt (createdAt fallback), links to order
details, and keeps lifecycle status badges.

### Verification and limits

- Browser: seven routes and one active navigation item at 1440, 1024, 768, and
  390px; no horizontal document overflow. Mobile menu closes on navigation and
  Escape. Sticky navigation remains reachable on long pages.
- Populated fixture: four real demo booking records, two Completed estimates;
  7-day/30-day/12-month filters and chart data table verified. A second owned seller
  with no data showed zero KPIs, no chart, and empty services.
- Browser actions: status filter; Accept and Decline with confirmations; no direct
  Accepted completion action; active-booking deletion blocked; service create/edit
  validation, archive/reactivate, Open/Full-book; messaging search, unread clearing,
  desktop and mobile replies; notification marking; seller profile city edit.
- Schedule page opened, but native date-picker entry was not completed through
  automation. Schedule ownership, overlap checks, persistence, and deletion remain
  covered by existing automated tests. No schedule logic changed.
- Four new analytics tests cover KPI definitions/estimates, calendar windows,
  exclusion of invalid/future dates, zero states, immutability, and independence
  from later status changes. Lint/build and all 160 tests passed.
- Tests used an isolated origin with synthetic accounts. Pre-existing Completed
  fixtures were made from existing Paid test records; no payment shortcut was added
  to the application. Temporary import pages were removed after browser checks.
- localStorage remains demo-only. Historical status-event dates, received payments,
  traffic metrics, and cross-device synchronization do not exist and are not shown.

### Exact Phase B file manifest

- Modified: `src/features/seller/SellerFrame.jsx`
- Modified: `src/features/seller/SellerOverviewPage.jsx`
- Modified: `src/features/seller/README.md`
- Added: `src/features/seller/BookingTrend.jsx`
- Added: `src/features/seller/sellerAnalytics.js`
- Added: `src/features/seller/seller-center.css`
- Added: `tests/seller-analytics.test.js`

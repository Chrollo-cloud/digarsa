# Phase 7: Seller Center + Admin Dashboard

Integrated on `integration/customer-seller` at baseline `32bde5e`. No new auth
system and no separate orders store.

## Reuse rules (agreed with the Customer owner)
- Auth/roles: Phase 5 `demoStore` only. Seller = owns a Seller Profile
  (`user.sellerProfileId`). Admin = `admin:access` permission, independent of seller.
- Orders: the SAME bookings in `digarsa.demo.customer.v1`. Seller reads/updates them
  through `customerStore.sellerView()` / `respondToBooking()`. Statuses are the
  existing ones (`Declined`, not `Rejected`).
  Transitions: Requested -> Accepted | Declined; Paid -> Completed only. Accepted remains Accepted until a legitimate future payment flow records Paid; no payment action is provided.
  Completed is allowed from Accepted because payment does not exist yet.
  Extra optional booking fields: `updatedAt`, `declineReason` (customer UI may show it).

## Routes
Seller (`RequireSeller`): `/seller-dashboard`, `/orders`, `/orders/:id`, `/services`,
`/services/new`, `/services/:id/edit`, `/services/:id/availability`, `/earnings`,
`/profile`.
Admin (`RequireAdmin`): `/admin`, `/moderation`, `/orders` (read-only), `/accounts` (read-only).

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
There is no UI to grant admin (by design). In the browser console after registering:
```js
const k="digarsa.demo.accounts.v1",d=JSON.parse(localStorage[k]);
d.accounts.find(a=>a.email==="EMAIL").permissions=["admin:access"];localStorage[k]=JSON.stringify(d)
```

This is a browser-storage demo, not server authorization.

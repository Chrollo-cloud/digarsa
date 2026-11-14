# Frontend stability patch

## Confirmed causes and behavior

- Booking validation trusted editorial creator metadata. Booking validation and submission now resolve the Seller Profile against the account store, require a unique real owner with a matching activation association and valid onboarding fields, and reject missing/orphaned profiles. Public editorial listings remain browsable. Existing booking records, account IDs, schemas, and status transitions are unchanged.
- Service deletion counted filtered booking rows without checking the read error. `getActiveBookingCount(serviceId)` now rejects unreadable, incomplete, partially invalid, and ownership-inconsistent records. Deletion requires a verified nonnegative integer count and blocks Requested, Accepted, or Paid bookings. Empty-string storage is damaged data; a genuinely absent key is a new empty store. No repair/reset is attempted.
- Catalog sync ignored returned integrity errors and reset to baseline on thrown errors. Sync now reads/validates/builds before publishing. Failed refreshes keep the last successfully published arrays and moderation, expose health/retry feedback, and disable new bookings. A fresh page with no valid snapshot labels baseline data as unverified. Catalog consumers subscribe to a small health/revision signal, not a new record store.

## Integration contracts

- `createCustomerStore` booking consumers must inject `resolveSellerProfile(id)` backed by `demoStore.getBookableSeller(id)`; the default denies booking. Existing fixtures now supply real seller ownership or an explicit account-registry test double.
- The application also injects `catalogError()` so stale/unverified catalog data cannot authorize new bookings. Public health state lives in `features/seller/catalogSync.js`.
- `createSellerStore` deletion consumers must inject an authoritative `activeBookingCount(serviceId)` that throws on integrity errors. The default fails closed. Application wiring uses the shared customer booking store.
- `applyCatalog()` returns true on success, false on failure; it never resets stored changes. Retry rereads sources without writing them.
- Seller Messaging/Notifications implementations and shared messaging contracts are untouched. The messaging integration test only receives the required booking eligibility dependency. Other branches constructing stores directly need the additive dependencies above for booking/deletion.

## Verification

Automated regression coverage includes fictional/orphaned ownership, direct-store bypass attempts, account switching, self-booking, existing lifecycle/privacy checks, corrupt/unavailable/incomplete booking storage, active and terminal statuses, invalid counts, valid deletion, catalog failures, moderation/snapshot preservation, subscriptions, retries, and booking gating during catalog failures.

Browser checks used synthetic accounts on a separate localhost origin: real service booking submitted as Requested; editorial booking unavailable; active-booking deletion rejected; catalog corruption preserved the seller listing with an explanatory notice; storage recovery restored normal behavior. The notice was readable at 1440px and 390px with no mobile horizontal overflow; mobile navigation opened/closed. Corrupt-booking deletion and valid deletion were verified by automated tests, not browser UI. Temporary fixture pages were removed.

localStorage remains a single-browser demo, not production authorization or synchronization. A last-valid snapshot is in memory only; a reload while sources are damaged shows explicitly unverified baseline data. Structurally valid records maliciously removed from localStorage cannot be detected without an authoritative backend.

## File manifest

Application changes:
- `src/features/account/demoStore.js`
- `src/features/customer/customerClient.js`
- `src/features/customer/customerStore.js`
- `src/features/seller/sellerClient.js`
- `src/features/seller/sellerStore.js`
- `src/features/seller/catalogSync.js` (new)
- `src/features/catalog/useCatalog.js` (new)
- `src/features/catalog/CatalogNotice.jsx` (new)
- `src/components/layout/PublicLayout.jsx`
- `src/features/customer/BookingRequestPage.jsx`
- `src/features/customer/CartPage.jsx`
- `src/features/customer/FavoritesPage.jsx`
- `src/pages/marketplace/MarketplacePage.jsx`
- `src/pages/marketplace/ServiceDetailPage.jsx`
- `src/pages/marketplace/CreatorProfilePage.jsx`

Tests and documentation:
- `tests/frontend-stability.test.js` (new)
- `tests/customer.test.js`
- `tests/seller.test.js`
- `tests/profile.test.js`
- `tests/messaging.test.js`
- `tests/fixtures/reviewScenario.js`
- `docs/frontend-stability.md` (new)

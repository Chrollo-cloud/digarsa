# G3 usability and demo booking verification

Branch: `feature/profile-location-improvements`. Baseline: `5385589`, preserving the existing uncommitted G1/G2 work. No commit, push, merge, branch switch, or staging performed.

## Root causes and changes

| Area | Finding | Resolution |
| --- | --- | --- |
| Navbar | Navy behind the blue logo reduced contrast; Seller Center had a decorative arrow. Cart was inside the account menu. | Cream blurred header, unchanged logo, dark text, no Seller Center arrow, one account-scoped cart icon beside notifications. |
| Demo booking | Editorial services lack legitimate account owners; their booking rejection is correct. | Opt-in loopback development setup uses actual account registration, seller activation and owned service creation. Authorization remains intact. |
| GPS | Coordinates were consumed without reporting browser accuracy; device providers can be coarse. | Retain reported accuracy in memory, show approximate meters and Wi-Fi limitations, preserve high-accuracy one-shot retry and error handling. |
| Manual correction | A map-selected point could leave coordinate inputs displaying older values. | Inputs refresh from the selected session point; existing shared map supports private correction and continued selection. Saving remains explicit. |
| Photos | Existing records supported image URLs, without device-file persistence. | Development-only IndexedDB blobs, owner/scope checks, transient object URLs, additive record references, preview/cancel/save/remove/replace. |
| Order language | Raw internal lifecycle values leaked into visible badges, filters and copy. | Shared Indonesian display mapping; internal enum and transitions unchanged. |
| Scroll | New navbar utilities crowded the tablet header; a large sticky map could be awkward on short viewports. | Collapse navigation at 900px; map height follows viewport and becomes static on short desktop viewports and mobile. Filters remain in normal page flow. |

## Models and storage

Existing versioned account records gain optional `avatarMediaId`; Seller Profiles gain optional `imageMediaId`. Stable account IDs and associations remain unchanged. HTTP(S) image references continue to work.

Development photos use IndexedDB `digarsa.demo.media.v1`, object store `photos`: `{id, ownerUserId, scope, blob}`, with account/seller scopes. Only references enter account localStorage. JPEG/PNG/WebP are validated at a maximum 5 MB, decoded, limited to 40 megapixels, resized to at most 1200 pixels on the longest side, and re-encoded. Object URLs are transient and revoked. Storage failures leave the prior profile reference intact. The UI identifies local-only storage. No backend upload, cross-device sync, crop UI, production media service, or production authorization is implied.

Browser-reported accuracy and live coordinates remain session-only unless the user explicitly saves the point through the existing private location store. Manual selection clears the device accuracy claim. Public seller coordinates still require confirmation and never derive from private buyer coordinates or city-name inference. Tile providers receive the viewed map area; this is explained in the UI.

## Demo booking instructions

See [BOOKING_DEMO.md](../src/dev/BOOKING_DEMO.md). Start Vite on loopback and open `/src/dev/bookingSetup.html` on the same origin. Explicitly choose private demo passwords or generate them with the setup button. Setup creates separate buyer and seller accounts, a real owned Seller Profile and onsite/remote services. Repeated setup reuses registered identifiers. Existing-email collisions fail rather than adopting or overwriting another account. No bookings or Paid records are seeded.

Reset archives fixture services only, preserving accounts, bookings and messages. Setup after reset creates a new service set. Generated passwords are not retained by the setup registry; keep the tab open if using them.

Checkout, simulated payment and password reset are absent at this baseline and remain deferred to teammate integration. Accepted cannot become Completed. Only an already-valid Paid booking may be completed under existing seller ownership checks. Identity verification is not required for demo seller activation.

## Automated verification

- `npm run lint`: PASS.
- `npm run build`: PASS, 217 modules. Main chunk 495.53 kB / 143.39 kB gzip; no chunk-size warning.
- `npm test`: PASS, 222 tests, 0 failed, 0 skipped. Includes 10 new G3 tests plus existing G1/G2 and integration regressions.
- `git diff --check`: PASS.
- Production bundle search: development booking registry and reserved fixture account strings absent.

New tests cover distinct cart counts and account/error isolation, accuracy parsing/session clearing, Indonesian labels with unchanged enum, owned demo setup/idempotency/collision rejection, buyer request and seller acceptance without payment bypass, nonproduction restrictions, photo file/decode/dimension checks, IndexedDB ownership/scope/persistence/failure, pixel resize/re-encoding, and profile reference ownership/association preservation. Existing tests cover denial/timeout/unsupported geolocation, lifecycle/decline, location privacy and permissions.

## Browser verification

Actual in-app browser, isolated loopback QA origin:

- PASS: Marketplace service to cart; immediate distinct cart badge; request form/review/submission; customer order tracking; separate owning seller sees and accepts the same request; no premature completion action.
- PASS: Seller photo preview/cancel/select/save/reload; public seller photo; buyer image isolation, save/reload, navbar avatar and remove.
- PASS: Nearby synthetic eligible service and confirmed public pin; straight-line distance; manual session coordinates and map-click correction update the selected point without implicit saving.
- PASS: real page scrolling at 1440, 1024, 768 and 390 CSS pixels. Page width equals viewport width; fixed header stays at top; filters move naturally; map intentionally sticky on larger screens and static on mobile.
- Actual location acquisition: NOT VERIFIED. Browser exposed a user-gesture fallback; no real GPS success or native permission acceptance is claimed. Permission/error branches are unit-tested, not equivalent to physical GPS testing.
- Native Chrome: browser-control unavailable.
- Native Safari: testing interrupted by concurrent user activity; full native workflow not completed. No Safari pass is claimed. A temporary agent-created Safari tab may remain because cleanup was interrupted; user tabs were left untouched.
- Seller decline is covered by the automated suite; the final manual journey used acceptance. Native cross-browser photo decoding and permission prompts need follow-up.

An unrelated temporary Admin source syntax error blocked initial app rendering; it was already absent when removal was authorized. Admin source now has no Git diff, and no Admin logic was modified. Temporary QA harness files were removed.

## Exact G3 file manifest

Paths below are relative to `frontend/`.

```text
src/components/layout/CartLink.jsx (new)
src/components/layout/Navbar.jsx
src/components/layout/Navbar.css
src/features/account/demoStore.js
src/features/account/profileValidation.js
src/features/customer/cartPresentation.js (new)
src/features/customer/BookingCard.jsx
src/features/customer/BookingDetailPage.jsx
src/features/customer/BookingRequestPage.jsx
src/features/customer/BookingSummary.jsx
src/features/customer/CartPage.jsx
src/features/customer/DashboardPage.jsx
src/features/customer/OrdersPage.jsx
src/features/customer/bookingLifecycle.js
src/features/location/BuyerLocationForm.jsx
src/features/location/DeviceLocationPanel.jsx
src/features/location/LocationMap.jsx
src/features/location/NearbyServicesPage.jsx
src/features/location/deviceLocationSession.js
src/features/location/location.css
src/features/location/locationModel.js
src/features/location/useDeviceLocation.js
src/features/location/public-location-picker.css
src/features/profile/Avatar.jsx
src/features/profile/PersonalInfoForm.jsx
src/features/seller/SellerOrderDetailPage.jsx
src/features/seller/SellerOrdersPage.jsx
src/features/seller/SellerOverviewPage.jsx
src/features/seller/SellerProfilePage.jsx
src/features/seller/sellerCatalog.js
src/features/workspace/WorkspaceFrame.jsx
src/pages/marketplace/CreatorProfilePage.jsx
src/dev/BOOKING_DEMO.md (new)
src/dev/bookingSetup.html (new)
src/dev/bookingSetup.js (new)
src/dev/demoBookingSetup.js (new)
src/features/media/LocalImage.jsx (new)
src/features/media/PhotoEditor.jsx (new)
src/features/media/mediaStore.js (new)
src/features/media/useLocalImage.js (new)
src/features/media/photos.css (new)
tests/g3-usability.test.js (new)
tests/redirects.test.js
docs/g3-usability.md (new)
```

G1/G2 edits are preserved, including Footer, AccountMenu, account-menu.css, PublicLocationFields, PortfolioLink, PublicLocationPicker, publicLocationDraft, publicUrl and profile-location-improvements tests. Avatar, CreatorProfilePage, LocationMap and picker styles also receive G3 changes. No dependencies, booking store, messaging/review contracts, Admin permissions or authentication guards changed.

## Remaining integration work

Replace development media references with backend-owned media IDs and upload authorization; browser storage is editable and local-only. Add actual payment/checkout only after reviewing teammate contracts. Validate geolocation permissions and device photo behavior on native Safari and Chrome, including iOS. Retain server-side ownership, lifecycle enforcement and location privacy when replacing demo adapters. No automatic geocoding or exact street-address claim was introduced.

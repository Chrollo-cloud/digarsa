# Phase D — Location and Nearby Services

## Routes and interface

`/nearby` is a lazy-loaded public discovery page linked from the existing
Marketplace hero. The global navbar structure is unchanged. Desktop uses results
on the left and an interactive Leaflet map on the right. Mobile puts the map above
the results and collapses secondary filters; search remains visible. Cards, map
pins, selection summary, Service Detail links, and the explicit map jump link share
selection. The list is the keyboard alternative to map interaction.

Profile and Settings contain the same account-scoped location editor. Seller
Profile and the existing service create/edit form contain optional public location
controls. New fields retain account/service ownership, validation, and lifecycle
rules rather than creating another account, catalog, or location database.

## Additive location models

Existing `digarsa.demo.accounts.v1` and `digarsa.demo.seller.v1` envelopes remain
version 1. Optional fields have their own version so legacy missing/null values are
valid. No automatic migration/write, ID change, or coordinate inference occurs.

Private account field `discoveryLocation`:

```text
{ version: 1, city: string, coordinates: { lat: number, lng: number } | null,
  source: "city" | "manual" | "geolocation", consent: boolean }
```

Coordinates require explicit storage consent and a manual/geolocation source.
City-only records have no coordinates and no coordinate consent. Location methods
read the current session, reject stale/wrong/duplicate owner IDs, and never return
this field in current-user public projections, public Seller Profiles, admin account
summaries, or catalog entries. Explicit clearing deletes only the current account's
field. Damaged storage is surfaced; it is not silently reset.

Optional Seller Profile field `publicLocation`, and optional service override
`serviceLocation`:

```text
{ version: 1, visibility: "hidden" | "area" | "pin", area: string,
  coordinates: { lat: number, lng: number } | null, confirmed: boolean }
```

- Hidden: empty area, null coordinates, confirmed false. Public projection is null.
- Area: supplied public area, null coordinates, confirmed false.
- Pin: supplied public area and valid coordinates, explicitly confirmed true.
- Service missing/null: inherit the profile's public location. An explicit hidden
  service override suppresses inheritance. Remote public services always have null
  map location, even when the profile or service has a stored pin.
- Changing coordinates clears confirmation in the editor. Choosing area/hidden
  removes those coordinates when the user saves. Existing public profile city is
  still displayed; the controls explicitly distinguish that city from service pins.
- Buyer coordinates are never copied to Seller/service fields. Onboarding remains
  optional for location; sellers can add it afterward in Profile Seller.

Invalid new stored service locations make catalog reads report integrity errors;
existing catalog synchronization retains its last valid snapshot. Nearby discovery
hides results/pins while catalog health is bad, even when a cached catalog exists.
It offers a retry that only rereads data. This never repairs or resets stored changes.

## Public/private APIs

Existing account store additions:
`getBuyerLocation()`, `updateBuyerLocation(input, { expectedUserId })`, and
`clearBuyerLocation({ expectedUserId })`. Existing Seller Profile activation/update
accept optional `publicLocation`; existing service create/update accept optional
`serviceLocation`. Omitted update fields preserve earlier location data.

Pure helpers: coordinate parsing/validation, private/public model validation,
`haversineKm(a, b)`, and `discoverServices(options)`. The discovery helper expects the
existing public catalog projection and account-backed `getBookableSeller` resolver.
It checks creator/owner association and excludes inactive, hidden/moderated,
Full-book/unavailable and editorial/orphaned services. Search, category, public area,
onsite/remote mode, radius, and distance ordering operate locally.

Distances use mean Earth radius 6371.0088 km and the Haversine formula. Only valid,
explicit coordinates participate. Labels say approximate straight-line distance;
there are no travel distances, directions, routing, or ETAs. Unpinned results have
null distance and rank after located results; radius filters exclude unknown
locations. Without an origin, results sort alphabetically. Remote results do not
rank by distance and do not inherit the buyer's saved city filter automatically.

## Mapping and privacy

Uses [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html) directly through a
small React lifecycle wrapper, without a React-Leaflet adapter dependency. Map code
and CSS load only when the map is used. Default view is Indonesia (-2.5, 118), not a
claim about a user's or creator's location. Panning, zoom buttons, keyboard controls,
clickable labeled pins, and manual point selection are functional.

Tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Visible attribution remains
on the map, with a link to OpenStreetMap contributors and a map-issue link.
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/): browser
HTTP caching/referrer defaults are retained; no cache-busting, prefetch, bulk download,
offline download, service-worker tile cache, routing, or geocoding is added. This
best-effort public tile source needs internet and has no availability guarantee;
production scale should use an appropriately provisioned provider. Tile failures
show a message while results and map markers remain usable.

The map renders only eligible public service points as markers. A valid buyer point
sets the viewport and distance origin, never a public marker, service record, URL
parameter, analytics event, or notification. Centering or manually exploring the map
necessarily requests that viewport's tiles from OSM, revealing the viewed area and
normal network metadata to the tile provider. The UI explains this limitation.

Only entering `/nearby` attaches the device-location controller. The first entry
checks browser permissions and makes one `getCurrentPosition` attempt if supported;
already-granted permission initializes automatically. A sessionStorage flag records
only that an attempt happened, never coordinates. Subsequent mounts do not re-prompt.
After a full reload, known granted permission can initialize again; prompt/unknown
permission with an existing attempt flag requires the explicit retry button. Without
the Permissions API, Geolocation itself decides permission. An uncompleted native
prompt is bounded by a 12-second UI watchdog, with a 10-second acquisition timeout.

`Gunakan lokasi saya` calls Geolocation synchronously inside the user gesture,
without first awaiting a Permissions query. Browsers still determine permission;
this does not bypass denial or OS/site settings. Loading, denied, gesture-required,
unsupported, unavailable and timeout states remain actionable. No watchPosition,
continuous tracking or background request is added. Unmount, manual selection,
clearing, and account changes invalidate late callbacks. StrictMode remounts share
the in-flight attempt rather than creating another request.

Detected/manual discovery points live in RAM, scoped to the current account/guest.
The hook masks previous-account coordinates before effects run. `Simpan lokasi ini
di akun` is the separate, explicit consent action that invokes the existing private
account method. `Hapus lokasi` clears RAM and the signed-in account's saved location;
storage failures are surfaced, not repaired or reset. Clearing suppresses automatic
reacquisition for that scope until explicit retry. The original Profile/Settings
editor remains user-initiated and never auto-detects location. Saved points remain a
fallback when no session point exists. Default nearby radius is 25 km when an origin
is available; users can change/reset it. City filters never infer coordinates.

LocalStorage remains an editable, single-browser demo, not production privacy or
server authorization. Other device users with storage access can inspect it.

## Original Phase D verification

- Existing 160 tests plus 12 location regressions: validation, consent, private
  ownership/persistence/clearing, unavailable/corrupt storage, permission denial,
  public visibility/inheritance/overrides, legacy reads, Haversine/antimeridian,
  ordering/radius/search, remote separation, eligibility, and catalog recovery.
- Browser: honest zero-result state before loading synthetic fixtures; loaded OSM
  tiles; card → pin and pin → card sync; zoom controls present; search/empty/reset;
  remote mode had no map/pins; manual map selection updated coordinate fields;
  consent required before save; approximate distances and radius worked; clearing
  and Profile city persistence survived refresh; account switching did not reuse
  the buyer location in the seller account.
- Seller browser checks: coordinate edits required renewed confirmation; profile
  hiding removed only inherited pins; service override could become area-only and
  then an explicitly confirmed pin again. Service Detail links worked.
- Simulated damaged catalog: zero discovery rows/pins, readable error, retry did not
  reset data; explicit fixture restoration recovered results and preserved edits.
- 1440, 1024, 768 and 390px: document width matched viewport; mobile compact filters
  and map jump link worked. Map animations are disabled and reduced-motion CSS is
  present. Native reduced-motion preference was not emulated.
- Device geolocation was explicitly requested, but this browser did not expose a
  completable native permission prompt. Actual browser denial was NOT verified;
  denied/timeout/unavailable cases are covered by automated tests. Successful
  device-coordinate acquisition also needs a manual test in a supporting browser.
- All browser data were isolated synthetic accounts and explicitly supplied test
  coordinates, labeled as synthetic QA areas, never fixtures seeded into production.
  Temporary test importer/corruption pages were removed afterward.

## Exact file manifest

- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/features/account/demoStore.js`
- `frontend/src/features/account/redirects.js`
- `frontend/src/features/location/BuyerLocationForm.jsx`
- `frontend/src/features/location/LocationMap.jsx`
- `frontend/src/features/location/NearbyServicesPage.jsx`
- `frontend/src/features/location/PublicLocationFields.jsx`
- `frontend/src/features/location/README.md`
- `frontend/src/features/location/discovery.js`
- `frontend/src/features/location/location.css`
- `frontend/src/features/location/locationModel.js`
- `frontend/src/features/location/useBuyerLocation.js`
- `frontend/src/features/profile/ProfilePage.jsx`
- `frontend/src/features/profile/SettingsPage.jsx`
- `frontend/src/features/seller/SellerProfilePage.jsx`
- `frontend/src/features/seller/ServiceFormPage.jsx`
- `frontend/src/features/seller/sellerCatalog.js`
- `frontend/src/features/seller/sellerStore.js`
- `frontend/src/pages/marketplace/CreatorProfilePage.jsx`
- `frontend/src/pages/marketplace/MarketplacePage.jsx`
- `frontend/src/pages/marketplace/ServiceDetailPage.jsx`
- `frontend/tests/location.test.js`

## Refinement verification and exact file manifest

This refinement changes these 11 files relative to the existing uncommitted Phase D
implementation (the preceding manifest describes that original work):

- `frontend/src/features/location/deviceLocationSession.js` (new)
- `frontend/src/features/location/useDeviceLocation.js` (new)
- `frontend/src/features/location/DeviceLocationPanel.jsx` (new)
- `frontend/src/features/location/NearbyServicesPage.jsx`
- `frontend/src/features/location/LocationMap.jsx`
- `frontend/src/features/location/BuyerLocationForm.jsx` (permission explanation only)
- `frontend/src/features/location/location.css`
- `frontend/src/features/location/README.md`
- `frontend/src/pages/marketplace/MarketplacePage.jsx`
- `frontend/src/pages/marketplace/marketplace.css`
- `frontend/tests/device-location.test.js` (new)

The standalone aqua hero CTA is replaced by an understated pin-icon link directly
below the existing search form: “Temukan layanan di dekatmu”. Search, filter, sorting,
hero typography, and natural scrolling are unchanged.

12 new automated tests bring the suite to 184 passing tests. They cover granted and
first-visit behavior, StrictMode/remount deduplication, denied and gesture-limited
browsers, synchronous gesture retry, timeouts/watchdog, unavailable/unsupported APIs,
invalid coordinates, blocked sessionStorage/missing Permissions API, stale callbacks,
manual selection, account switching, and explicit private save/clear. Existing seller
visibility, ownership, Haversine, discovery, corruption and recovery tests remain.

Browser refinement checks:

- In-app browser: real Geolocation timed out without a completable permission prompt.
- Native Safari: explicit retry returned permission denied; manual coordinate input
  then worked. No native permission dialog was observed or approved, and successful
  real GPS acquisition was not verified.
- Clearly labeled temporary QA page mocked granted, denied, gesture-required,
  timeout, unavailable, unsupported states. Synthetic account-owned service pins
  appeared at supplied QA coordinates. Changing radius from 25 to 5 km reduced two
  services to one; changing the manual origin updated the matching result/distance.
  Remote showed one service, no map/pins. No travel times were invented.
- Saved-location fields were empty after automatic detection, populated only after
  the separate save button, and empty again after explicit clear. Rerenders, filters,
  Marketplace navigation and Nearby reentry did not increase the mock request count.
- Marketplace keyword search returned the matching service, and ascending price
  sorting worked. Nearby discovery link navigated correctly.
- At 1440/1024/768/390px, document widths matched viewport widths on Marketplace
  and Nearby, including expanded manual coordinate fields. The hero link remained
  8px below the search area; mobile navigation opened and closed via Escape, and
  compact Nearby filters expanded correctly.
- Temporary mock/seed HTML was removed from the repository. Synthetic data were
  isolated to the QA origin on port 5353, not seeded into application source.

Real permission dialogs, successful device GPS and mobile Safari hardware still
require manual device validation. No browser permission was bypassed or silently
granted. LocalStorage remains a demo, not secure production storage or cross-device
synchronization.

# Reviews, ratings and location privacy

## Confirmed reviews

Sources: [reviewStore.js](../../src/features/reviews/reviewStore.js), [reviewAdapters.js](../../src/features/reviews/reviewAdapters.js), [reviewActions.js](../../src/features/reviews/reviewActions.js), [ReviewFormPage.jsx](../../src/features/reviews/ReviewFormPage.jsx).

A review belongs to one customer-owned **Completed** booking. Requested/Accepted/Paid/Declined/Cancelled are ineligible. One review per booking is enforced across reloads. Session identity supplies the author, with an expected_user_id stale-form check. Service/profile IDs must match the authoritative booking; self-review is blocked by owner account and profile association. A historical removed service can still be reviewed through a valid Completed booking if its seller owner remains resolvable. Admin permission grants no review bypass.

Submit input is exactly `{booking_id,service_id,seller_profile_id,rating,comment}`. Rating integer1–5; trimmed comment must contain at least 10 visible non-whitespace characters, ≤2000 UTF-16 code units, no unsupported controls. Names/title snapshots 1–200. The full stored record and public projection are in [data-model.md](data-model.md). Public output excludes booking/customer IDs, brief/contact/credential fields and adds `verified:true`. Demo verified means validated against demo Completed ownership, not independent proof of server payment.

`update(review_id,{rating,comment},{expected_user_id})` rechecks author, Completed status and associations; preserves ID, booking/service/profile/customer IDs, names/title snapshots and created_at. It adds or changes canonical updated_at, never earlier than previous update/creation. Legacy version-1 rows without updated_at remain valid and are not rewritten on read. Unknown fields/corrupt records block writes; failure never reports an unsaved change as saved.

`reviewActions.submit` persists first, then requests one new_review notice; a delivery error yields `{review,notification_error}` rather than undoing the successful save. `retryNotification` rechecks ownership, and shared event keys prevent duplicates. `reviewActions.update` emits **no** new_review event. Public aggregates recompute from current verified records after edits. Display snapshots intentionally do not follow later account/studio renames.

`listPublic({service_id?,seller_profile_id?})` filters conjunctively, newest first. `getSummary`/`summarizeReviews` return total, arithmetic average (null when empty) and five count/percentage bins 5→1 (all zero when empty). Marketplace rating sort and verified badges use these data. Static catalog illustrative testimonials remain separately labeled; never add their scores/counts to verified averages. `listOwn` and notification context recheck the private booking; anonymous publication verifies public identities without retrieving private bookings. Backend must independently enforce actual owner FKs and Completed event provenance, not trust browser verified flags.

**Proposed backend:** unique booking FK, authoritative eligibility endpoint, transaction submit+aggregate invalidation+outbox, optimistic concurrency on edit, stable IDs and source snapshots. No review deletion/moderation/like/reply capability is currently defined. Edit limits/history retention are open policy choices; current implementation imposes no time-window limit.

## Confirmed location records

Sources: [locationModel.js](../../src/features/location/locationModel.js), [demoStore.js](../../src/features/account/demoStore.js), [sellerStore.js](../../src/features/seller/sellerStore.js), [sellerCatalog.js](../../src/features/seller/sellerCatalog.js).

```text
BuyerLocation { version:1, city:string,
  coordinates:{lat:number,lng:number}|null,
  source:"city"|"manual"|"geolocation", consent:boolean }
PublicLocation { version:1, visibility:"hidden"|"area"|"pin", area:string,
  coordinates:{lat:number,lng:number}|null, confirmed:boolean }
```

Exact shape validation rejects unknown keys. Coordinates require finite numeric latitude −90..90 and longitude −180..180, both present. Empty/malformed/nonfinite input is not interpreted as zero. City/area labels ≤120, no control characters. No coordinate values are included in these examples.

| Location mode | Required fields and projection |
| --- | --- |
| Buyer city-only | City≥2 chars; coordinates null, source city, consent false; never infer a pin |
| Buyer manual/GPS saved | Valid paired point; explicit consent true; source manual or geolocation; city may be empty |
| Seller hidden | Empty area, coordinates null, confirmed false; public projection null |
| Seller public area | Area≥2 chars, coordinates null, confirmed false |
| Seller public pin | Area≥2 chars, valid coordinates, confirmed true after intentional seller confirmation |
| Service override missing/null | Inherit seller profile public location |
| Service explicit hidden override | Suppress inherited pin/area |
| Remote service projection | No public map point regardless of saved seller/service location |

Private account `discoveryLocation` is separate from profile `publicLocation` and service `serviceLocation`. The buyer point is never copied to seller/service records. Profile's city remains intentionally public even if a seller hides a pin. Hidden point fields are not returned in public projections. Seller coordinate edits require renewed confirmation; selecting hidden/area removes coordinates on save. Optional missing fields remain compatible with legacy records.

## Device permission and consent

[deviceLocationSession.js](../../src/features/location/deviceLocationSession.js) attaches only from Nearby through [useDeviceLocation.js](../../src/features/location/useDeviceLocation.js). First Nearby entry checks permission if available, then attempts one getCurrentPosition; already-granted can initialize automatically. The sessionStorage key `digarsa.demo.nearby.location-attempted.v1` stores only an attempt flag, not coordinates. Repeated mounts/rerenders do not repeatedly prompt; StrictMode immediate remount shares an in-flight request. With a prior flag and permission prompt/unknown, show gesture-required retry; known granted may initialize after reload. Browser/OS decides permission; no bypass is possible.

`Gunakan lokasi saya` retries inside an explicit gesture. States include idle/checking/loading/ready, denied, gesture, timeout, unavailable, unsupported and cleared. Native acquisition uses a10-second timeout and UI watchdog12 seconds; no watchPosition/continuous/background tracking. Cancel/unmount/account change/manual choice/clear invalidate late callbacks. Browser APIs may be unavailable or require user activation; manual city/point selection keeps discovery usable.

Detected/manual points live in RAM scoped to current account/guest. Merely granting permission does **not** save GPS. `Simpan lokasi ini di akun` separately calls the owner-scoped save method with consent. Saved account location is fallback when no live session point exists. Clear removes live point and signed-in account saved preference; it suppresses reacquisition until explicit retry. Inaccessible storage errors surface without reset. Location is not included in current-user public projection or admin summary. localStorage itself is readable/editable by the device user, not secure private storage.

## Nearby eligibility and distance

[discovery.js](../../src/features/location/discovery.js), [NearbyServicesPage.jsx](../../src/features/location/NearbyServicesPage.jsx):

- Reliable catalog required. Bad catalog health suppresses rows/pins even when old catalog data exists. Retry only rereads; no reset/repair.
- Only Open, active, nonhidden services with legitimate account-backed seller profiles and matching owner metadata are included. Editorial/orphaned/unavailable services are excluded. Public marketplace can display Full-book/editorial records; Nearby has stricter discovery eligibility.
- Mode onsite/remote separate. Category exact match. Query normalized Indonesian case-insensitive title/category/seller/area/city text. City matches public area **or legitimate seller public city**; e.g. Makassar can match a studio district label when seller.city is Makassar. It never changes the displayed area, reveals hidden points or geocodes text.
- Only confirmed public pin coordinates generate pins/distances. Haversine uses mean Earth radius6371.0088km; result is approximate straight-line distance, not driving route/time. No ETA, routing or inferred coordinates.
- Radius >0..20000km requires valid origin and onsite mode; unknown point distances are excluded under radius. Otherwise unknown distances rank after known ones, with title tie order. Without origin, title ordering; remote distance null and no map pins. UI default radius25km when origin exists, selectable5/25/100/500 or no limit.
- Saved city defaults only for onsite when no live device/manual point; remote does not automatically apply buyer saved city. Textual city and geographic radius are independent filters.
- Cards and map pins share selected service ID; no eligible services yields an honest empty state, not invented pins. A list provides a keyboard alternative to the map.

[LocationMap.jsx](../../src/features/location/LocationMap.jsx) uses Leaflet and OpenStreetMap browser tiles with visible attribution/map-issue link. Default viewport is regional, not a buyer/seller location claim. Tile loading is external best-effort; errors leave results usable. Viewing an origin-centered viewport necessarily discloses viewed tile area/network metadata to the provider; the existing UI explains this. No geocoder/routing or tile caching infrastructure is implemented. Provider/scale/privacy policy needs team approval before production.

## Proposed location integration

- Dedicated owner-only `/me/location`; no private fields on public `/me` projection, creator/catalog/admin lists or notifications. Persist only explicit save, allow clear. Define retention/consent expiry and deletion in team policy.
- Use the proposed read-only POST nearby search with origin in body, **never** URL/query/analytics; redact request bodies from access/application logs. Do not echo buyer origin or persist it simply to search. Return sanitized public seller points and nullable distance only.
- Server geospatial indexing of confirmed public seller/service pins can accelerate radius search. Preserve exact validation, inheritance/hidden/remote semantics and independent city match. Index choice depends on database. Do not geocode city labels without separate product/consent decision.
- Keep device permission handling on client; backend cannot guarantee GPS access. Permission is not persistence consent. No new browser GPS success was verified during this documentation phase.

Regression anchors: [reviews.test.js](../../tests/reviews.test.js), [location.test.js](../../tests/location.test.js), [device-location.test.js](../../tests/device-location.test.js). Retain edit/no-renotify/public-summary tests and Makassar, consent, hiding/inheritance, radius, unsupported/denied/gesture/timeout, no-repeat, stale callback and account-switch tests. Mocks validate behavior, not actual native permission prompts or device acquisition.

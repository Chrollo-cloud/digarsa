# Customer Reviews & Ratings

Built on `feature/customer-reviews` from `c740d41`. One review repository serves
customer management, public service/creator ratings, and the shared notification
resolver. No prototype implementation or Dribbble assets were copied.

## Schema

Storage key: `digarsa.demo.reviews.v1`.
Envelope: `{ version: 1, reviews: Review[] }`.

```text
Review {
  id: string                 // review-<UUID>, stable across reloads
  booking_id: string         // unique: one review per booking
  service_id: string
  seller_profile_id: string
  customer_user_id: string
  reviewer_name: string      // display-name snapshot, not email
  service_title: string      // historical booking snapshot
  seller_name: string        // historical studio-name snapshot
  rating: integer           // 1–5
  comment: string            // trimmed, 10 visible non-whitespace characters minimum;
                             // 2000 UTF-16 code units maximum, no unsupported controls
  created_at: string         // canonical ISO 8601 UTC timestamp
}
```

Names/titles are 1–200 characters. IDs use the existing alphanumeric, hyphen and
underscore convention, up to 200 characters. Record fields are exact; unknown,
missing, malformed, duplicate-ID, duplicate-booking or incompatible-version data
blocks reads/writes with `STORAGE_CORRUPT`. Damaged data is never silently replaced.
Missing storage starts empty. Unavailable/quota-limited storage surfaces an error.

Public publication omits `booking_id` and `customer_user_id`, adds `verified: true`,
and contains no account contact details, brief, password or permissions. It includes
only the public review ID, service/profile IDs, name/title snapshots, rating,
comment and creation timestamp. The verified label means that the demo submission
passed Completed-booking and owner checks; it is not server verification.

## API

UI imports `reviewStore` from `reviewClient.js`; it never accesses storage directly.
Methods are synchronous, return copied data, or throw `ReviewError` with `code` and
an Indonesian `message`. `reviewAdapters.js` normalizes existing account, booking,
and catalog entities without changing those sources.

| Method                                                 | Return / behavior                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `listPublic({ service_id?, seller_profile_id? } = {})` | Sanitized published reviews, newest first; anonymous access.                                                                          |
| `getSummary(filter = {})`                              | `{ total, average, distribution }`; null average when empty; distribution has five `{ rating, count, percentage }` rows, 5 through 1. |
| `listOwn()`                                            | Current customer's full reviews, rechecked against their Completed bookings.                                                          |
| `listCompletedBookings()`                              | Current customer's Completed contexts as `{ booking, eligible, reason, review }`.                                                     |
| `getEligibility(booking_id)`                           | Same eligibility result for an owned booking; other customers' IDs return a generic not-found/forbidden error.                        |
| `submit(input, { expected_user_id })`                  | Saves one immutable Review. Input is exactly `{ booking_id, service_id, seller_profile_id, rating, comment }`.                        |
| `getNotificationContext(review_id)`                    | Current author's verified `{ id, customer_user_id, seller_profile_id, booking_id }` for the shared notification resolver.             |
| `subscribe(listener)`                                  | Unsubscribe function; committed review writes only.                                                                                   |
| `summarizeReviews(validReviews)`                       | Pure statistics helper, also exported by the client. Never mixes catalog testimonials.                                                |

`createReviewStore` injects storage, currentUser, account-scoped listBookings,
resolveSellerProfile and resolveService, with optional randomId/now for tests.
Resolver data uses snake_case; the source account remains the existing Phase 5 user.

`reviewActionsClient.js` exposes `reviewActions`:

- `submit(input, options)` returns `{ review, notification_error }`. A saved review
  remains successful if the separate notification write fails; the UI offers retry.
- `retryNotification(review_id)` validates author ownership and invokes the existing
  `messagingStore.notifyReviewEvent`. The shared event index prevents duplicates.

Error codes: `UNAUTHENTICATED`, `SESSION_CHANGED`, `NOT_FOUND_OR_FORBIDDEN`,
`INELIGIBLE`, `SELF_REVIEW`, `DUPLICATE_REVIEW`, `INVALID_INPUT`, `INVALID_CONTEXT`,
`INVALID_DEPENDENCY`, `DEPENDENCY_UNAVAILABLE`, `STORAGE_UNAVAILABLE`,
`STORAGE_CORRUPT`.

## Ownership and lifecycle

The current session supplies author identity. The expected account ID protects
stale forms; callers cannot provide customer identity, names, permissions or the
new review's generated ID. Inputs must match the authoritative owned booking and live
service-to-Seller-Profile relationship. The Seller Profile resolves to its actual
account owner; profile IDs are never treated as user IDs. Self-review is blocked
by both ownership and the current profile association. Admin status gives no bypass.

Only Completed is eligible. Requested, Accepted, Paid, Declined and Cancelled stay
ineligible. This feature never writes booking/payment state. A removed service may
still be reviewed through its historical Completed booking if its Seller Profile
owner can be verified. Historical public review cards label removed services as
archives. Editorial creators without an owned profile do not gain verified reviews.

Published reviews are an immutable public record after successful submission;
anonymous reads recheck public seller/service identity and never fetch or expose
private bookings. Self-authored seller records or mismatching live service owners
in stored data are rejected. Own/notification reads
recheck the account-scoped association. Public names/titles remain snapshots after
profile edits. Normal booking lifecycle has no reversal from Completed.

## UI

- `/reviews` requires login: own written reviews, real average/distribution, eligible
  Completed bookings, star filtering, newest/oldest/highest sorting and zero states.
- `/review/:bookingId` requires login and ownership. Native radio inputs support
  arrow-key star selection; text length, errors, saving and confirmation are exposed.
- Completed order details link to the form or the already-written review page.
- Service details and public creator profiles have verified overview/card sections.
- Marketplace cards and rating sorting now use verified data only. Existing mock
  testimonials remain in a separate, explicitly illustrative section; their scores
  never enter verified averages, counts or distribution.

The screenshot informs the 35/65 overview/list composition, compact brand accent,
initials, star placement and histogram. Digarsa uses indigo/blue/aqua/paper,
Space Grotesk, Manrope and DM Mono. Tablet adjusts to 38/62; mobile stacks. There
are no fictional votes, testimonials, reply/like actions, purple theme or new sidebar.

## Files

Added in `frontend/src/features/reviews/`:

- `reviewStore.js`, `reviewAdapters.js`, `reviewClient.js`
- `reviewActions.js`, `reviewActionsClient.js`, `useReviews.js`
- `ReviewsPage.jsx`, `ReviewFormPage.jsx`, `BookingReviewAction.jsx`
- `ReviewsBoard.jsx`, `ReviewSummary.jsx`, `ReviewCard.jsx`, `RatingStars.jsx`
- `PublicReviews.jsx`, `VerifiedRating.jsx`, `reviews.css`, `README.md`

Added tests:

- `frontend/tests/reviews.test.js`
- `frontend/tests/fixtures/reviewScenario.js`

Existing files modified:

- `frontend/src/App.jsx`: the two authenticated routes.
- `frontend/src/features/account/AccountMenu.jsx`: Ulasan Saya navigation.
- `frontend/src/features/account/redirects.js`: safe review return paths.
- `frontend/src/features/customer/CustomerFrame.jsx`: review navigation.
- `frontend/src/features/customer/BookingDetailPage.jsx`: Completed review action.
- `frontend/src/features/messaging/messagingClient.js`: one authoritative review resolver.
- `frontend/src/pages/marketplace/ServiceDetailPage.jsx`: verified section/summary.
- `frontend/src/pages/marketplace/CreatorProfilePage.jsx`: verified section/summary.
- `frontend/src/pages/marketplace/MarketplacePage.jsx`: verified rating sorting.
- `frontend/src/components/marketplace/ServiceCard.jsx`: verified badge.
- `frontend/src/components/marketplace/Reviews.jsx`: distinguish existing testimonials.

Shared messaging contracts/store/adapters, seller UI, admin UI, account store,
booking store and lifecycle rules are unchanged. There is no second notification
store or additional account/provider.

## Verification and limits

Run `npm run lint`, `npm run build`, `npm test` from `frontend`.
Final verification: lint and build pass; all **114 tests pass**, including 22 new
review tests. Browser QA verified two real UI submissions from Completed fixtures,
their 4.5 average and 50%/50% distribution, filters/sorting, public service/creator
reviews, separate zero-count/demo testimonials, required fields, keyboard stars,
duplicate prevention, Requested rejection, protected return paths, account switching,
seller-side ownership denial, and two correctly targeted `new_review` notifications.
Dashboard, form, service/profile and marketplace views showed no horizontal overflow
at 1440, 1024, 768 and 390px.

The automated suite includes eligibility, invalid statuses, association/self/owner
protection, duplicates, validation, persistence, account switching, public privacy,
real statistics, notification targeting/retries, damaged storage, sources and IDs.

`tests/fixtures/reviewScenario.js` is Node-only QA: synthetic accounts and services,
pre-existing Paid fixture records, then completion via the real seller API. It is
not imported by the app and adds no checkout shortcut. Browser QA uses isolated
origins so existing demo account data is preserved; temporary import pages/data
are removed after setup. Reviews are actually submitted through the production UI.

Browser localStorage can be inspected/edited by its user. This is neither secure
production authorization nor cross-device synchronization. Public publication trusts
the validated demo submission boundary, not an external oracle proving stored data
hasn't been tampered with. A backend must authenticate and verify all associations.
Concurrent tabs retain last-writer-wins behavior; there is no transactional outbox
for review/notification writes, server moderation, review editing/deletion, pagination,
or payment integration. Until checkout exists, the app cannot advance Accepted to
Paid; reviews require legitimate existing Completed records or explicit QA fixtures.

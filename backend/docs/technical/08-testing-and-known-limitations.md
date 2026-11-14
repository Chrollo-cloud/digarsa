# DIGARSA — Testing and Known Limitations

## Latest recorded verification

These figures are the latest supplied or report-recorded evidence. They were not rerun while writing documentation.

| Check | Result | Boundary |
|---|---:|---|
| Focused frontend authentication/API tests | 10 passed | Mocked/unit behavior; not live HTTP. |
| Runtime authorization checks | 27/27 passed | Historical runtime checks with existing test accounts; not rerun here. |
| Full frontend suite | 237 passed, 49 failed, 286 total | Latest two runs reported the same set. No pre-change baseline exists; causes are mixed or unconfirmed. Do not label all failures as old or as application defects. |
| ESLint on changed frontend files | Passed | Scoped lint, not necessarily whole-repository lint. |
| Production frontend build | Passed | Build reports a minified bundle above 500 kB advisory. |
| Browser visual walkthrough | Not comprehensively verified | No claim of a full browser rendering, console, and network walkthrough. |
| Runtime `logout-all` on disposable account | Not verified | Source increments token version and revokes all sessions, but disposable-account runtime proof is absent. |
| Booking/payment runtime workflow | Not comprehensively verified | Tests and source do not establish complete current Supabase end-to-end behavior. |
| Database migration/introspection in documentation phase | Not run | No database operation is part of this documentation result. |

## Known limitations

- Frontend features are not uniformly integrated: admin account tools, messaging, reviews, and notifications include local/demo or unverified behavior; formal dispute/appeal/assistance UI is unavailable per current feature matrix.
- Full frontend test suite has 49 unresolved failures in the latest recorded run; no baseline permits attributing them as pre-existing.
- Backend package `test` script is a placeholder and exits nonzero. Past focused backend runs are historical evidence only.
- Frontend production build passes with a large-chunk advisory.
- Browser visual/network verification is incomplete.
- `logout-all` revokes every account session when successful; single-session server-side revocation is not implemented by that endpoint.
- Trusted payment gateway/QRIS settlement, refund, payout, and wallet execution are not established. Demo payment routes must remain clearly labeled.
- Seller activation uses a non-identity review; legacy identity fields/routes are not an active requirement.
- Source inspection does not prove all race conditions, scheduler recovery, or live deployment behavior.

## Evidence discipline

Separate source implementation, mocked/unit results, historical runtime results, and plans. The [Project Documentation Audit](../PROJECT_DOCUMENTATION_AUDIT.md) contains the scope and evidence notes. Do not claim production readiness from these checks alone.

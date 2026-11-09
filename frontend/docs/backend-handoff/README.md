# Digarsa frontend-to-backend handoff

Documentation baseline: **53855896a1a51839a55cb10ad0de3492a6b392b6**, audited on `docs/backend-handoff`, 9 November 2026. This directory is a specification, not a backend implementation.

## Read this first

- **Confirmed** means behavior inspected in the current source. Existing feature READMEs contain historical milestone descriptions; where these disagree, current code takes precedence.
- **Proposed** means a backend design for team approval. Every `/api/v1` URL in this directory is proposed; none is implemented by this frontend.
- **Needs confirmation** identifies unresolved product/technical policy.
- **Demo limitation** means browser-local behavior, never a production security or synchronization guarantee.

One account always retains buyer access. An owned Seller Profile adds seller capabilities; its ID is distinct from the account ID. Admin requires explicit `admin:access`. Customer and seller orders share one booking repository. Customer and seller chat share one messaging repository and notification collection.

Bookings enforce Requested → Accepted → Paid → Completed; sellers accept/decline Requested or complete an already-Paid booking. There is no payment action and no customer cancellation action. Reviews require owned Completed bookings and can be edited without changing their identity or producing another `new_review` notification.

The public catalog contains both editorial examples and real seller-owned services. Public display is not evidence of bookability. Booking and Nearby must verify legitimate seller ownership and catalog health. Service deletion must fail closed if active bookings cannot be verified. Catalog errors retain the last valid in-memory projection, expose the failure, and block unsafe booking/discovery.

## Documents

| Document | Purpose |
| --- | --- |
| [architecture.md](architecture.md) | Exact source inventory, routes, method boundaries, persistence and dependencies |
| [data-model.md](data-model.md) | Confirmed DTOs, explicit field mappings and proposed normalized database |
| [api-contract.md](api-contract.md) | Proposed REST endpoints, examples, errors, validation and concurrency |
| [permissions.md](permissions.md) | Session identity, ownership, privacy and recommended server security |
| [booking-lifecycle.md](booking-lifecycle.md) | State transitions, eligibility, deletion and transaction requirements |
| [messaging-notifications.md](messaging-notifications.md) | Exact shared contracts, contexts, role views, retry and delivery semantics |
| [reviews-locations.md](reviews-locations.md) | Verified reviews/editing, private location and public discovery |
| [integration-plan.md](integration-plan.md) | Ordered client replacement, migration, acceptance tests and rollback |
| [open-decisions.md](open-decisions.md) | Team approval checklist and known compatibility gaps |

## Highest integration risks

1. Current synchronous stores/resolvers/hooks cannot be replaced by Promises without adapting their consumers. Preserve presentation, add explicit request/loading/error boundaries and account-keyed cache invalidation.
2. localStorage is user-editable; IDs, statuses, permissions and historical data are untrusted imports. Never automatically copy demo credentials or claim demo Completed records prove payment.
3. Browser tabs use read/modify/write, not database transactions. Race-safe booking transitions, service deletion, conversation uniqueness and review uniqueness require backend constraints and transactions.
4. Booking/review saves and their notification delivery are separate operations. Replace client event observation with transactional outbox events, not dual client/server notification producers.
5. Public account projection excludes private location and credentials. Existing messaging/review adapters resolve profile owner IDs, but do not uniformly apply the stronger booking ownership proof. The server must join actual account/profile/service records for every operation.
6. Seller earnings are estimates from booking snapshots; schedules are planning intervals, not capacity reservations. Payment, settlement, cancellation and capacity policies need decisions.

## Scope and verification

No source, tests, configuration, API client, database migration or prototype file is changed by this phase. Only these ten Markdown files are deliverables. The completion report records fresh lint/build/test results; historical counts in feature READMEs are not the current result. No new browser or device-GPS verification is claimed for this documentation task.

The source inventory links are repository-relative from this directory. API examples use invented opaque identifiers and non-sensitive copy only; no credential values, private coordinate values or local browser records are included.

## Fresh validation — 9 November 2026

- `npm run lint`: PASS, exit0.
- `npm run build`: PASS, exit0;205 modules transformed.
- `npm test`: PASS;205 tests,205 passed,0 failed,0 skipped,0 cancelled.
- `git diff --check`: PASS. New Markdown also checked separately because untracked files are not included in the normal Git diff.
- All relative Markdown source/document links resolve;70 endpoint method/path pairs and IDs are unique.
- SHA-256 comparison confirms all previously tracked files remain unchanged. No source/test/configuration changes, staging, branch switch or Git history action. Browser/device testing was not performed for this documentation-only phase.

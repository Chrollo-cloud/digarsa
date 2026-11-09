# Team decisions and integration assumptions

No checkbox below is decided merely by appearing in a proposal. Assign owners and record decisions before implementation.

## Platform and contract agreement

- [ ] Backend framework/runtime, service ownership and deployment environments; no framework was selected by this frontend audit.
- [ ] Database and migration/backup/recovery procedures; null-safe context uniqueness, FK retention, overlap checks and geospatial indexing must be supported by chosen design.
- [ ] Approve `/api/v1` resource names, response/error envelopes, ID alphabet, cursor/total semantics, HTTP conditional update strategy and actor-scoped retry key retention.
- [ ] API origin, TLS/proxy trust, CORS credentials and CSRF model. Sessions/cookies/expiry/rotation, concurrent sessions and password-change revocation policy.
- [ ] Credential onboarding/recovery/email verification policy. Current UI has no recovery/email edit flow; do not invent one in adapter implementation.
- [ ] Trusted Admin provisioning/revocation/audit process outside public registration. Local development setup is not production access management.

## Catalog, seller and financial policy

- [ ] Editorial prototype creators/services: retain as clearly nonbookable content, migrate to separate content store, or remove from production. No invented owner account or weakened booking FK.
- [ ] Favorites/cart strategy for editorial/archived entries, including stable IDs and removable unavailable entries. No bulk checkout implied.
- [ ] Soft deletion/tombstone behavior vs demo physical service removal; retain historical booking/review/chat references and active-booking refusal. Archive remains separate from delete.
- [ ] Moderation retention/audit and reason visibility. Existing capability is hide/restore only; account suspension, seller verification/approval and review moderation are future scope.
- [ ] Seller service price bounds/currency and whether proposed stricter DB constraints accept any historical imports. Preserve original booking estimate snapshots.
- [ ] Seller planning timezone, scheduling policy and whether future bookings reserve a slot/capacity. Current requested dates do not reference planning slot IDs; `requiresSchedule` is recognized by validation but not exposed in seller write model.
- [ ] Payment provider, verified server confirmation events, amount matching, replay policy, refunds/disputes/settlement. No current payment endpoint/action or actual earnings ledger. Paid must never be customer-selected.
- [ ] Cancellation policy: permitted source states, actor rights, reason requirements, refund consequences and event types. Cancelled is readable today but no cancellation command exists. Proposed cancellation API is deliberately deferred.
- [ ] Analytics timezone, historical event availability, exact KPI denominators and future money reporting vocabulary. Current estimates must not become received payments by renaming.

## Messaging, notifications and reviews

- [ ] Real-time technology (polling/SSE/WebSocket), reconnect cursor and authorization revocation behavior; REST remains authoritative.
- [ ] Role-scoped inbox/notification counts for dual buyer/seller accounts; preserve same repository, no duplicate stores.
- [ ] Null-safe context key across general/service/booking enquiries; historical context after service archive/delete.
- [ ] Message receipt watermark policy across devices. Current demo read marks incoming rows and related notices; notification-only marking doesn't imply message read.
- [ ] Idempotency retention, outbox retry/operational monitoring and delivery expectations. Atomic server event producer replaces demo booking bridge/review post-save delivery; never run both as authorities.
- [ ] Notification channel strategy. Current implementation is in-app only; email/push preferences, Paid/Cancelled events and generic arbitrary-notice writes are not implemented.
- [ ] Review edit window/audit history/content policy and public snapshot names. Current authors can edit rating/comment without renotification, with stable identity and optional updated_at. Verified public statistics exclude illustrative testimonials.
- [ ] Public review identity minimization and archived service display. Full own records contain booking/customer IDs, public records omit them.
- [ ] Chat/review retention/export/deletion/abuse process, including unsolicited off-platform payment text; heuristic client warnings are not moderation/payment validation.

## Privacy, media and migration

- [ ] Buyer precise location retention/consent renewal, encryption/access control/deletion and minimized logging. Browser permission is not consent to persistence.
- [ ] Nearby POST body/cursor policy, public-point geospatial index and city matching. No geocoding from city labels or driving-time claims without separate functionality.
- [ ] Map/tile provider contract, scale, attribution and disclosure of viewed-area/network metadata. Do not promise GPS or tile availability.
- [ ] Media URL allowlist/proxy or controlled upload/storage/CDN. Current forms accept one URL; no upload API/storage contract exists.
- [ ] Discard demo data vs explicit validated opt-in migration; never trust demo admin permissions, credentials, owners or payment states. Preserve/validate stable associations if importing anything.
- [ ] Async adapter rollout/cache invalidation/error recovery and rollback per [integration-plan.md](integration-plan.md); no silent demo fallback for authenticated writes.

## Confirmed gaps and risks to track, not silently repair in this phase

| Finding | Evidence and impact | Handoff action |
| --- | --- | --- |
| Nested availability return mismatch | App/SellerCenter route is `/seller-dashboard/services/:serviceId/availability`, but safeReturnTo allowlist covers edit and a different standalone availability shape | Add exact route regression/fix in a later code phase; preserve current guards |
| Differing ownership resolvers | Booking/Nearby use getBookableSeller; messaging/review adapters use public profile lookup and owner-ID projection | Backend enforce real account/profile/service FKs universally; adapter owner string alone is not trusted proof |
| No cancellation command | customerStore exposes no cancellation mutator despite readable Cancelled | Do not implement deferred API until policy approval |
| No real payment path | Only pre-existing valid Paid records can complete in demo | Payment integration is separate; no UI mark-paid shortcut |
| Schedules don't reserve bookings | Schedule planning intervals vs date-only booking model | Decide explicit reservation semantics later |
| No durable cross-store notification transaction | Booking bridge/review save+notify can miss delivery after write succeeds | Server outbox/unique events; saved business action remains success |
| Sync local repositories | Consumers render synchronous views and subscriptions | Explicit async adaptation and cache privacy tests |
| Different storage validation strengths | Messaging/reviews strict; customer/seller report valid subset+error; account parser is less strict | Backend validate full write/relationships; no universal claim of frontend strictness |
| Historical docs lag source | Earlier customer/profile/messaging milestone sections describe already-delivered functions as future work | Current source inventory is authoritative for this handoff; old files unchanged |
| No native device assurance from tests | Unit permission mocks and historical browser notes are not fresh GPS verification | Separate actual Safari/device QA from simulated tests |

## Approval exit criteria

A backend owner and frontend owner agree on models/DTO adapters, ownership matrix, transaction boundaries, endpoint catalogue and deferred capabilities. Security/privacy owners agree on sessions, provisioning, buyer location handling and retention. Integration phase owners commit to acceptance/rollback criteria without UI redesign. Unanswered decisions stay visible; they are not filled with fabricated guarantees.

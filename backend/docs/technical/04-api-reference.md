# DIGARSA — API Reference (Source Inventory)

## Reading this reference

The routes below are registered in Express source and are grouped by router. Registration proves a handler exists, not that a deployment is reachable or that its frontend workflow is complete. Request schemas are in each module's `*.schema.ts`; controller/mapper code defines response envelopes. This guide summarizes important contracts and does not invent sample payload fields.

Access labels: **Public**, **USER** (authenticated `Role.USER`), **Seller profile**, **Approved seller**, **ADMIN**, and **Owner/participant**. Controllers may add state and ownership checks. Error status is not uniform: commonly 401 unauthenticated, 403 capability/role denial, 404 concealed or missing resource, 409 state conflict, and 400/422 validation.

## Authentication — `/api/auth`

| Method and path | Access | Purpose |
|---|---|---|
| `POST /register`, `POST /login` | Public; login rate-limited | Registration/login; Zod validation, password hashing and access-token response. |
| `GET /me`, `PATCH /me`, `DELETE /me` | Authenticated owner | Current account read, validated update, deletion. |
| `POST /change-password`, `POST /logout-all` | Authenticated owner | Password rotation; logout-all increments token version and invalidates all account sessions. |
| `GET/PATCH/DELETE /me/discovery-location` | Authenticated owner | Read/update/clear private discovery location. |
| `POST /password/forgot`, `/password/verify-otp`, `/password/reset` | Public; rate-limited as configured | Password recovery. |

## Sellers — `/api/sellers`

| Method and path | Access | Purpose |
|---|---|---|
| `POST /apply` | Authenticated | Create own seller profile. |
| `GET/PATCH /me` | Authenticated owner | Read/update own seller profile. |
| `GET /me/verification`, `POST /me/verification` | Authenticated; submit is USER | Legacy identity verification endpoints; current submit is unavailable, not the active activation workflow. |
| `GET/POST/DELETE /me/activation-review` | USER with own seller profile | Read, submit/resubmit, withdraw non-identity review with profile/portfolio/service-offer snapshots and hash. |
| `GET /admin/activation-reviews`, `GET /admin/activation-reviews/:review_id`, `PATCH /admin/activation-reviews/:review_id` | ADMIN | Queue, detail, approve/reject. Rejection reason and transitions are validated. |
| `GET /admin/verifications`, `GET /admin/verifications/:id/document`, `PATCH /admin/verifications/:id` | ADMIN | Legacy identity routes are unavailable in current implementation. |
| `GET /:id` | Public | Public seller profile. |
| `GET/POST/PATCH/DELETE /me/portfolio[/:item_id]` | USER with own profile | Portfolio CRUD with ownership checks. |

## Services and saved items — `/api/services` and `/api/v1`

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/services/categories`, `GET /api/services`, `GET /api/services/:id` | Public | Categories, listing and detail. List filters include query, region/category, sort and pagination fields. |
| `GET /api/services/mine`, `POST /api/services` | USER with seller profile | Own service list/create. Route declaration requires profile; approval is not attached at this route. |
| `PATCH/DELETE /api/services/:id` | USER with seller profile | Update/delete own service; ownership and active-booking protections apply. |
| `PATCH /api/services/:id/status`, `/visibility`, `/active` | Approved seller, owner checked | Service status, visibility and active state. |
| `GET/POST /api/services/:id/availability`, `PATCH/DELETE /api/services/:id/availability/:slotId` | Approved seller, owner checked | Service availability slot management. |
| `GET /api/services/admin/moderation`, `PATCH /api/services/admin/moderation/:id` | ADMIN | Moderation queue and decision. |
| `GET /api/v1/services`, `GET /api/v1/services/:service_id`, `GET /api/v1/creators/:seller_profile_id`, `GET /api/v1/catalog/facets` | Public | Public catalog, detail, creator profile and facets; catalog query enforces seller/service/category gates. |
| `GET /api/v1/me/favorites`, `PUT/DELETE /api/v1/me/favorites/:service_id` | Authenticated owner | Read/add/remove favorites. |
| `GET /api/v1/me/cart`, `PUT/DELETE /api/v1/me/cart/:service_id` | Authenticated owner | Read/add/remove cart rows; does not reserve availability. |
| `PATCH /api/v1/seller/services/:service_id/availability` | Approved seller, owner checked | Alternate service availability update. |

## Booking and lifecycle — `/api/v1`

| Method and path | Access | Purpose |
|---|---|---|
| `POST /services/:service_id/booking-validation` | USER | Server validates eligibility and current quote/revision-policy acknowledgement. |
| `POST /bookings` | USER | Create booking using server-owned price/status and submitted policy acknowledgement. |
| `GET /me/bookings`, `GET /me/bookings/:booking_id` | USER, customer owner | Customer list/detail. |
| `POST /me/bookings/:booking_id/complete` | Customer owner | Completion acceptance subject to server state/timers/blockers. |
| `POST /me/bookings/:booking_id/cancellation-requests` | Customer owner | Submit reason/evidence request; not an automatic refund. |
| `GET /seller/bookings`, `GET /seller/bookings/:booking_id` | Approved seller, own booking | Seller list/detail. |
| `POST /seller/bookings/:booking_id/accept`, `/decline`, `/deliver` | Approved seller, owner/state checks | Seller transitions and delivery. |
| `GET/POST /me/bookings/:booking_id/revisions`; `POST .../:revision_id/withdraw`, `/accept-rejection`, `/clarifications`, `/clarifications/:clarification_id/respond`, `/assistance` | Customer owner | Standard revision lifecycle, clarification and assistance. |
| `GET /seller/bookings/:booking_id/revisions`; `POST .../:revision_id/respond`, `/deliver`, `/assistance` | Approved seller, owner | Seller revision response/delivery/assistance. |
| `GET/POST /me/bookings/:booking_id/additional-revision-requests`; `POST .../:request_id/withdraw`, `/clarifications/respond`, `/offers/:offer_id/accept` | Customer owner | Additional-work revision request lifecycle. |
| `GET /seller/bookings/:booking_id/additional-revision-requests`; `POST .../:request_id/clarifications`, `/reject`, `/offers` | Approved seller, owner | Seller clarification/reject/offer actions. |
| `GET /admin/cancellation-requests`, `PATCH /admin/cancellation-requests/:cancellation_id` | ADMIN | Cancellation review decision; does not itself change financial state. |
| `GET/POST/PATCH /admin/revision-assistance[/:assistance_id]`; `POST /admin/revisions/:revision_id/system-error-quota-return` | ADMIN | Assistance queue/detail/transitions and narrow quota return. |
| `POST /me/bookings/:booking_id/disputes`, `/seller/bookings/:booking_id/disputes` | Customer/seller booking party | Create eligible dispute. |
| `GET /me/disputes/:dispute_id`, `GET /seller/disputes/:dispute_id` | Participant owner | Read dispute. |
| `POST /disputes/:dispute_id/clarifications/:clarification_id/respond`, `/evidence/messages`, `/appeals`; `GET /appeals/:appeal_id` | Participant/appeal owner | Respond, link message evidence, submit/read appeal. |
| `GET /admin/disputes[/:dispute_id]`, `POST /admin/disputes/:dispute_id/review`, `/clarifications`, `/decision`, `/reports` | ADMIN | Dispute queue/review/clarification/decision/evidence report. Decision does not imply payment/refund mutation. |
| `GET /admin/appeals[/:appeal_id]`, `POST /admin/appeals/:appeal_id/assignment`, `/decision` | ADMIN | Appeal queue/detail, assignment and decision. |

## Other modules — `/api/v1`

| Method and path | Access | Purpose |
|---|---|---|
| `POST /services/:service_id/conversations` | USER | Start service conversation. |
| `GET /me/conversations`, `GET/POST /conversations/:conversation_id/messages` | Participant | List conversations/messages and send message; participant ownership checked. |
| `GET /me/notifications`, `/me/notifications/unread-count`; `PATCH /me/notifications/read-all`, `/me/notifications/:notification_id/read` | Authenticated owner | Own notifications/count/read state. |
| `POST /bookings/:booking_id/review`; `GET /services/:service_id/reviews`, `/sellers/:seller_id/reviews`, `/reviews/:review_id`; `GET/PATCH/DELETE /me/reviews[/:review_id]` | USER create; public reads | Review eligibility and ownership checks apply. |
| `POST /reports`, `GET /me/reports`, `GET /reports/:report_id` | USER, own report | Create/read own report. |
| `GET /admin/reports`, `/admin/reports/:report_id`; `PATCH /admin/reports/:report_id` | ADMIN | Report queue/detail/decision. |
| `GET/POST /api/sellers/me/portfolio`, `PATCH/DELETE /api/sellers/me/portfolio/:item_id` | USER with own seller profile | Portfolio operations, mounted outside `/api/v1`. |

## Demo payment routes and availability

The payment router exposes `GET /api/v1/payments/demo/availability`, booking and additional-revision `demo-payment` routes, plus seller demo-start/demo-deliver and customer demo-complete routes as declared by middleware. They are explicitly demo paths and do not represent a trusted provider, QRIS, settlement, or production payment integration. Exact route registration and current gates are in `src/modules/payments/`.

## Legacy, unavailable, and verification status

- Seller identity verification routes are legacy/unavailable in current implementation. Current activation is non-identity.
- The endpoint inventory is source-derived; it does not establish live deployment availability.
- Current frontend integration is mixed. See `../PROJECT_DOCUMENTATION_AUDIT.md` and the frontend feature matrix for the per-feature boundary.
- No credential, token, or environment value is included here.

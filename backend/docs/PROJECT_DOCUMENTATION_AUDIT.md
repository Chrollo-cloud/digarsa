# DIGARSA — Project Documentation Audit

**Audit type:** Source and documentation inventory; read-only with respect to application behavior and data
**Audited workspaces:** `D:\hackathon_plat\backend` and `D:\hackathon_plat\frontend_fix\frontend`
**Approved development project reference:** `ztdhvlfewgczwycjyube` (owner-provided project context; no connection or database identity check was performed during this audit)
**Evidence date:** 2026-11-14

This report records what the current source and available reports support. A model, enum, API adapter, or old report alone is not treated as proof that a feature is operational. Line references are relative to the workspace named in the link and may move as the code changes.

## 1. Project Overview

| Topic | Audit finding | Status and evidence |
|---|---|---|
| Purpose | DIGARSA is a marketplace that connects customers with creative service providers, supports service discovery and seller operations, and provides booking lifecycle and administrative controls. This is a description of implemented product structure; no user research or market-size claim was found in the reviewed evidence. | **Implemented in part.** Backend modules under `src/modules/{catalog,sellers,services,bookings}` and frontend routes in [`App.jsx`](../../frontend_fix/frontend/src/App.jsx). |
| Problem addressed | The repository describes discovery, service offers, availability, booking, delivery/revision, and oversight workflows. A validated research statement about the problem or its prevalence was not found. | **Unverified as a research claim.** Describe only as the product problem framing until the owner supplies research evidence. |
| Target users | Customer (`USER`), seller (a user with an associated seller profile; seller capability is distinct from the database `Role` enum), and admin (`ADMIN`). | **Implemented.** Prisma `Role` enum and `SellerProfile`; backend [`auth.middleware.ts`](../src/middleware/auth.middleware.ts), frontend [`Guards.jsx`](../../frontend_fix/frontend/src/features/account/Guards.jsx). |
| Customer capabilities | Browse public catalog and creator profiles; maintain favorites/cart; authenticate; create and manage own bookings, revisions, cancellation requests, and eligible reviews; use conversations/notifications where connected. | **Mixed:** route support exists in backend; feature integration differs by frontend module (see sections 5, 7 and 9). |
| Seller capabilities | Prepare profile/portfolio/service offers, submit activation review, and—when approved—manage availability and perform seller booking actions. | **Mixed.** `requireSellerProfile` and `requireApprovedSeller` are separate gates; see sections 7–9. |
| Admin capabilities | Review activation, moderate services/reports/cancellations, and administer revision assistance, disputes, and appeals. | **Backend routes implemented.** Frontend admin surface exists, but not every formal workflow is integrated. |
| Current limitation | Application is not established as production-ready by these materials. Trusted payment gateway/QRIS settlement and financial execution are not verified; some frontend features remain local/demo; browser visual and complete runtime verification are incomplete. | **Documented limitation.** See [`FEATURE_STATUS.md`](../../frontend_fix/frontend/docs/phase-5.9.9/FEATURE_STATUS.md) and section 11. |

## 2. Technology Stack

Versions below are taken from lockfiles/package manifests. They are installed/declared dependencies; use/import references were checked for the principal runtime packages. “Used” does not imply every feature of a package is active.

| Layer | Technology | Version / evidence | Use |
|---|---|---|---|
| Frontend | React, React DOM | 19.3.1, frontend lockfile | Component UI and client-side state. |
| Frontend routing | React Router DOM | 7.18.5, frontend lockfile | Browser routes and guarded nested areas. |
| Frontend build/dev | Vite, React Vite plugin | 8.3.6 / 6.2.1, frontend lockfile | Dev server and production build. |
| Frontend lint | ESLint, React Hooks/Refresh plugins | ESLint 10.14.0; hooks 7.1.1 | Static linting. |
| Frontend mapping | Leaflet | 1.9.4 | Geographic service UI. |
| Backend runtime | Node.js | Audit process reported v24.19.0; not a pinned runtime declaration in the backend manifest. | TypeScript ESM application. |
| Backend HTTP | Express | 5.3.0 | Routing/middleware in `src/app.ts`. |
| Backend security/middleware | Helmet 8.3.0, CORS 2.8.6, express-rate-limit 8.7.2, Multer 2.5.0 | Backend lockfile | Headers, origin policy, rate limits, in-memory uploads. |
| Backend validation/logging | Zod 4.6.7, Pino 10.4.0 | Backend lockfile | Zod schemas are imported by modules. Pino is declared, but this audit did not confirm a centralized Pino logger; `http.ts` has `console.error`. |
| Database/ORM | PostgreSQL, Prisma CLI/Client/PG adapter | Prisma 7.10.1; adapter-pg 7.10.1; `pg` 8.23.1 | Prisma schema/migrations and `PrismaPg` runtime adapter. Approved development project is owner-provided context, not independently checked here. |
| Password/JWT | bcryptjs 3.0.3, jsonwebtoken 9.0.3 | Backend lockfile | Password hash/verify and HS256 access-token flow. |
| Storage | Supabase Storage REST API via `fetch` | `src/lib/storage.ts` | Private KTP/cancellation evidence functions are implemented; actual buckets and production use were not verified. |
| TypeScript execution/build | TypeScript 5.9.3, `tsx` 4.23.15 | Backend lockfile | Backend source, watch, and build scripts. |
| Tests | Node built-in test runner | Frontend `node --test`; backend test directory plus historical direct runner evidence | Frontend has a real test script. Backend package `test` is a placeholder that exits nonzero; see section 11. |

Frontend production package dependencies do not include a UI test renderer; current tests are principally Node tests of stores, adapters, models, helpers, and Vite plugin behavior. The frontend API adapter tests use mocked `fetch`, not a live backend.

## 3. System Architecture

### Backend request path

`src/server.ts` loads dotenv, creates the Express listener, and calls `startBookingSchedulerIfEnabled`. `src/app.ts` installs Helmet, CORS, JSON body parsing, rate limiting, module routers, health/root routes, 404 and error handlers. Routers dispatch to controllers, which validate request input with Zod schemas and call Prisma-backed services/controllers. The shared Prisma client is in `src/config/prisma.ts`; the schema and migration history are under `prisma/`.

Important evidence: [`server.ts`](../src/server.ts), [`booking-scheduler-startup.ts`](../src/lib/booking-scheduler-startup.ts), [`app.ts`](../src/app.ts), [`config/prisma.ts`](../src/config/prisma.ts), [`http.ts`](../src/lib/http.ts).

### Frontend request path

`App.jsx` mounts `BrowserRouter` and `AuthProvider`, public pages, authenticated customer routes, seller/admin guards, and lazy-loaded pages. The shared [`apiClient.js`](../../frontend_fix/frontend/src/lib/apiClient.js) reads `VITE_API_BASE_URL` (default `http://localhost:3000`), sends JSON and optional Bearer access token, and normalizes transport/API errors. Feature-specific adapters call it: `catalogApi.js`, `authApi.js`, `sellerServicesApi.js`, `sellerPreparationApi.js`, `bookingApi.js`, and `savedItemsApi.js`.

### Identity/session flow

Frontend login/register call `/api/auth/login` and `/api/auth/register`; `AuthProvider` stores the access token using `authToken.js`, requests `/api/auth/me` to restore a session, and updates the legacy local feature session bridge. Backend `authenticate` verifies HS256 JWT claims, fetches current user role/status/tokenVersion, and rejects stale token versions. `POST /api/auth/logout-all` increments tokenVersion and revokes all account tokens, not just the browser's current token. Runtime logout-all against a disposable account is **not verified**.

### Database and external services

Backend database runtime uses `DATABASE_URL` through `PrismaPg`; `prisma7.config.ts` loads dotenv and uses `DIRECT_URL` for Prisma CLI. Runtime removes connection URL SSL query parameters and supplies the project CA with `rejectUnauthorized: true`; CLI sets `sslmode=require`, the CA file path, and `sslaccept=strict`. `src/lib/storage.ts` calls Supabase Storage endpoints with `SUPABASE_URL`, a service key, and bucket variables. No storage request or live database call was made in this audit.

### Background work

The server calls the scheduler startup guard; only an explicit case-insensitive `BOOKING_SCHEDULER_ENABLED=false` suppresses scheduler startup, while unset/default preserves existing startup. The booking scheduler runs on a 60-second interval and includes delivery-cycle completion and overdue revision-assistance processing. Scheduler execution behavior is not claimed from this source audit as a live runtime check.

## 4. Backend Structure

| Path | Responsibility |
|---|---|
| `src/app.ts`, `src/server.ts` | Express setup, route mounting, health route, listener and scheduler bootstrap. |
| `src/config/prisma.ts`, `src/generated/prisma/` | PostgreSQL adapter and generated Prisma client. Generated output exists; generated code is not source-of-truth. |
| `src/middleware/` | JWT auth/role checks and memory upload parsing. |
| `src/lib/` | HTTP errors, JWT/password/crypto, audit, storage, notifications, scheduler startup. |
| `src/modules/auth/` | Registration/login/profile/password/reset/session endpoints. |
| `src/modules/catalog/`, `services/`, `sellers/`, `portfolio/` | Public catalog, service CRUD, activation/profile/portfolio and moderation. |
| `src/modules/bookings/` | Booking, delivery cycles, revisions, assistance clocks, disputes/appeals, cancellation, scheduler/outbox. |
| `src/modules/payments/` | Demo payment routes/policy plus payment-facing module structure; not evidence of live gateway settlement. |
| `src/modules/reviews/`, `conversations/`, `notifications/`, `reports/` | Reviews, messaging, notifications and formal reports. |
| `tests/`, `test-db.ts` | Backend tests and database helper; `test-db.ts` connects to the configured Prisma runtime when explicitly executed. |

Backend route families are mounted under `/api/auth`, `/api/sellers`, `/api/services`, and `/api/v1` (see [`app.ts`](../src/app.ts)). The exact routes are inventoried in section 7.

### Empty module-folder cross-check

The owner-provided count was checked against recursive file enumeration in each named directory: all 11 directories below exist and contain zero files. This is a statement about folder contents only; feature status is based on routes, handlers, services, schema, and frontend calls inspected outside those folders.

## Feature Implementation Mapping

| Empty folder | Feature status | Evidence found elsewhere | Audit interpretation / limits |
|---|---|---|---|
| `src/modules/admin/` | **Implemented in another module/location** | Admin route handlers are registered in `services/service.routes.ts` (`GET /admin/moderation`, `PATCH /admin/moderation/:id`), `sellers/seller.routes.ts` (activation-review queue/detail/decision), `bookings/booking.routes.ts` (cancellation, revision-assistance, dispute, appeal routes), and `reports/report.routes.ts` (report queue/detail/decision). Access checks use `requireRole("ADMIN")`. Frontend admin pages live in `frontend_fix/frontend/src/features/admin/` and `/admin/*` is guarded in `App.jsx`/`Guards.jsx`. | Admin backend capabilities exist across domain routers. Frontend is mixed: `AdminAccountsPage.jsx`/`useAdmin.js` read the legacy local stores; no backend admin user-list/account-management route was found. Formal dispute/appeal/assistance UI is marked unavailable by the current feature matrix. |
| `src/modules/availability/` | **Partially implemented** | Availability slot routes are in `services/service.routes.ts`: `GET/POST /:id/availability`, `PATCH/DELETE /:id/availability/:slotId`; `service-availability.routes.ts` adds `PATCH /seller/services/:service_id/availability`. Handlers are `listAvailability`, `createAvailability`, `updateAvailability`, `removeAvailability`, and `updateSellerServiceAvailability` in `service.controller.ts`. Frontend API and UI are `seller/sellerServicesApi.js`, `SellerServicesProvider.jsx`, and `SellerAvailabilityPage.jsx`. | Service-specific slot CRUD exists elsewhere and requires approved seller. Schema also has `SellerUnavailableDate`, but no route/controller for managing unavailable dates was found. |
| `src/modules/cart/` | **Implemented in another module/location** | `catalog/catalog.routes.ts` exposes `GET /me/cart`, `PUT /me/cart/:service_id`, `DELETE /me/cart/:service_id`; `catalog/saved.controller.ts` functions `listCart`, `addCartItem`, `removeCartItem`. Frontend uses `customer/savedItemsApi.js` and `savedItemsStore.js`. | Server-backed saved cart entries exist. Cart is not a booking or availability reservation. |
| `src/modules/categories/` | **Implemented in another module/location** | `GET /api/services/categories` maps to `service.controller.listCategories`; `GET /api/v1/catalog/facets` maps to `catalog.controller.getCatalogFacets`. Frontend facet hook is `catalog/usePublicCatalog.js`; catalog page passes facets to `components/marketplace/Filters.jsx`. | Category listing/facets exist in service/catalog modules; no separate categories router is needed to establish this. |
| `src/modules/chat/` | **Partially implemented** | Backend uses the domain name conversations: `conversations/conversation.routes.ts` registers `POST /services/:service_id/conversations`, `GET /me/conversations`, and `GET/POST /conversations/:conversation_id/messages`; controller functions include `createServiceConversation`, `listMyConversations`, `listConversationMessages`, and `sendConversationMessage`. | Backend conversation API exists. Current frontend messaging pages use local/demo messaging stores per the latest feature matrix and `messagingClient.js`/`customerMessagingClient.js`; frontend-to-backend chat integration is not established. |
| `src/modules/favorites/` | **Implemented in another module/location** | `catalog/catalog.routes.ts` registers `GET /me/favorites`, `PUT/DELETE /me/favorites/:service_id`; controller functions are `listFavorites`, `addFavorite`, and `removeFavorite` in `catalog/saved.controller.ts`. Frontend uses `customer/savedItemsApi.js` and `savedItemsStore.js`. | Backend favorites and current frontend adapter are found outside the empty folder. |
| `src/modules/feedback/` | **Not implemented (in inspected application routes)** | `Feedback` exists in `prisma/schema.prisma` and a `User.feedbacks` relation exists. No feedback route, controller/service, or frontend feedback API call was found in the inspected route and feature source. | Schema model alone does not establish a working feedback submission/read feature. The empty directory itself is an unused scaffold in this snapshot. |
| `src/modules/recommendations/` | **Not implemented (as a dynamic application feature found in scope)** | No recommendation endpoint, backend handler, or recommendation API adapter was found. `marketplace.css` contains `.market-recommendations` selectors, but the current `MarketplacePage.jsx` renders the catalog, filters, and load-more states without a recommendation component. Homepage editorial/featured content is separate static presentation. | CSS naming or static editorial selection is not evidence of a recommendation engine. The empty directory is an unused scaffold in this snapshot. |
| `src/modules/search/` | **Implemented in another module/location** | `GET /api/v1/services` (`catalog.routes.ts` → `catalog.controller.listPublicServices`) accepts `q`, category, availability, price and city filters, sort, limit, cursor. `GET /api/services` (`service.routes.ts` → `service.controller.listServices`) also has a validated service-list query. Frontend `MarketplacePage.jsx`, `catalogApi.js`, and `usePublicCatalog.js` send query/filter/sort/cursor values. | Search is catalog listing behavior, not a separate search subsystem. Backend public catalog query matches title, description, category and seller display name. |
| `src/modules/uploads/` | **Partially implemented** | `middleware/upload.middleware.ts` defines in-memory `evidenceUpload` and `ktpUpload`. Cancellation route `POST /api/v1/me/bookings/:booking_id/cancellation-requests` uses `evidenceUpload.single("evidence")`; `bookings/cancellation.controller.ts` calls `uploadCancellationEvidence` in `lib/storage.ts`. Storage helpers also include private KTP upload/signing functions. | Cancellation evidence upload has a route path. No generic upload API for avatars, service images, portfolio image upload, or arbitrary files was found. `ktpUpload` and legacy verification handlers are not proof of an active identity-verification upload flow; current identity verification routes are unavailable. |
| `src/modules/users/` | **Partially implemented** | Account functions live in `auth/auth.routes.ts` and `auth.controller.ts`: register/login, `/me` read/update/delete, password change/logout-all, discovery location, and password recovery. `middleware/auth.middleware.ts` reloads authenticated user state. | Self-service account/auth functionality exists under `auth`. No dedicated admin user listing/management API router was found. The frontend Admin account page uses the local/demo `useAdmin` store, so it must not be described as backend user administration. |

**Folder interpretation:** all 11 named directories are empty scaffolds/unused locations in the active backend snapshot. That does not mean all 11 corresponding product capabilities are absent: several are implemented under other domain modules. The feature status in this table distinguishes folder status from feature status and frontend integration status.

## 5. Frontend Structure

| Area | Source | Current architecture/status |
|---|---|---|
| Routing/application shell | `src/App.jsx`, `src/pages/RouteShell.jsx`, `src/components/layout/` | Public layout, customer authenticated subtree, nested seller and admin guards, lazy loading for large pages. |
| Authentication | `src/features/account/AuthProvider.jsx`, `authContext.js`, `authApi.js`, `Guards.jsx`, `src/lib/authToken.js` | Backend-backed login, registration, session restoration and profile update through shared API client. Legacy feature store is synchronized for compatibility. |
| Marketplace | `src/pages/marketplace/`, `src/features/catalog/`, `src/components/marketplace/` | Public catalog adapters call backend service listing/detail/creator/facets APIs. Search/filter and catalog UI use the adapter/hook. Home editorial/showcase assets and `src/data/home.js` are static/editorial rather than verified business records. |
| Customer profile | `src/features/profile/` | Profile/settings UI; current customer profile path uses backend auth API, while address book/photo/media paths have local/browser persistence elements. Review precise `README.md` before describing persistence in academic material. |
| Seller preparation | `src/features/sellerPreparation/` | Seller profile, portfolio, activation-review and service preparation adapters. |
| Seller Center | `src/features/seller/` | Service and availability API integration uses `sellerServicesApi.js` and `SellerServicesProvider`. Other seller modules (for example payout estimate/history and some messaging/notification surfaces) include demo/local stores; do not describe them as authoritative backend finance. |
| Customer workflows | `src/features/customer/`, `src/features/bookings/` | Saved items and booking APIs are present; backend is intended to own booking state. Local store files remain for compatibility/demo features, and should not be equated with current server-backed booking state. |
| Reviews, messaging, notifications | `src/features/reviews/`, `src/features/messaging/` | Backend endpoints exist. Latest feature matrix marks frontend review/messaging clients as local/demo and notifications as not verified connected. |
| Admin UI | `src/features/admin/` | Admin route and dashboard exist. Formal backend dispute/appeal/admin-assistance workflows lack integrated frontend screens per latest feature matrix. |
| Styling/assets | `src/App.css`, `src/index.css`, `src/styles/`, `src/assets/` | Existing visual system, static editorial content and image assets. |

Protected page routes in `App.jsx` include `/dashboard`, `/profile`, `/settings`, `/favorites`, `/cart`, `/checkout`, `/payment/:bookingId`, `/booking/:serviceId`, `/orders`, `/orders/:bookingId`, `/reviews`, `/review/:bookingId`, messaging/notifications, `/seller-dashboard/*`, and `/admin/*`. Frontend route guards are a UX layer; backend authorization remains authoritative.

## 6. Database Design

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma), 62 models and 40 enums. The schema is declarative; this report does not assert that every field/table exists in a live database. Migration directories are ordered from `20261101082859_init` through `20261120120002_phase5106_demo_financial_guards` (16 directories). No migration command or database introspection was performed for this audit.

### Model inventory

The inventory below lists every model and its role plus representative business/key fields. For exact scalar types, all relation fields, referential actions, and every `@@unique`/`@@index`, use the linked schema as authoritative.

| Models | Purpose and key fields/relationships |
|---|---|
| `User`, `PasswordReset` | Account identity, role/status, password hash, token version, profile/location; reset OTP/token hashes, attempts, expiry and use timestamps. `User.email` unique; reset rows reference user and index user/creation time. |
| `SellerProfile`, `SellerVerification`, `SellerActivationReview` | Seller account/profile and two distinct review systems. Profile is one-to-one with user; verification holds legacy encrypted NIK/document-path fields. Non-identity activation review stores profile/portfolio/service-offer JSON snapshots, hash, status and reviewer history; `activeSellerId` unique. |
| `SellerUnavailableDate`, `SellerAvailabilitySlot`, `PortfolioItem` | Seller date blocks, service-specific date/time slots, and portfolio images. Unavailable date unique by seller/date; availability references seller and service and has seller/date and service/date indexes. |
| `Category`, `Service`, `ServiceImage` | Public catalog taxonomy and seller offers. Category name/slug unique. Service references seller/category and stores price, delivery, revision policy, active/hidden/moderation/availability, location and rating aggregates; indexed by status/category/region, moderation/hidden, and price. Service images reference service. |
| `Favorite`, `CartItem`, `ServiceView` | User-to-service saved state and views. Favorite/cart unique by user/service; views indexed by user/time. |
| `Booking`, `BookingStatusEvent`, `BookingOperationReceipt`, `CancellationRequest` | Booking snapshot and status lifecycle, event history, idempotency receipts and cancellation review/evidence. Booking references customer, seller profile and service; indexes by customer and seller/status. Composite uniqueness protects operation receipts and cancellation identifiers. |
| `BookingReviewTimer`, `BookingReviewPauseInterval`, `BookingReviewJob` | Booking review timer, pause intervals, and scheduled job/claim state. Jobs carry scheduled/claim status and indexes on schedule and claim expiry. |
| `DeliveryCycle`, `DeliveryCyclePauseInterval`, `DeliveryCycleJob`, `DeliveryCycleCompletionReceipt` | Per-booking delivery/review cycles, blockers/pause ledger, scheduler jobs and completion receipts. Unique booking/sequence; job unique by booking/cycle; receipt unique by cycle/principal/operation. |
| `RevisionRequest`, `RevisionClarification`, `RevisionEvent`, `RevisionQuotaLedger`, `RevisionOperationReceipt` | Revision lifecycle, clarification response clock, event history, append-oriented quota delta ledger and idempotent operation receipts. Revision is scoped to booking/cycle; unique booking/id and revision/principal/operation guards. |
| `RevisionEscalationRequest`, `RevisionEscalationEvent`, `RevisionEscalationOperationReceipt`, `RevisionResponseClockPause`, `RevisionResponseClockResume` | Admin assistance/escalation, state event/receipt, and exact response-clock pause/resume history. Assistance tracks status/version/SLA; receipt unique by assistance/principal/expectedVersion. Pause rows store remainingMs; resume rows store restored deadline. |
| `AdditionalRevisionRequest`, `AdditionalRevisionOfferVersion`, `AdditionalRevisionAgreement`, `AdditionalRevisionEvent` | Separate paid-additional-work request, versioned seller offers, accepted agreement snapshots, event history, payment and ledger/payout relations. Offer versions unique by request/version. |
| `PaymentTransaction`, `ProviderEventInbox`, `PaymentRefund`, `SellerPayout`, `FinancialLedgerEntry` | Payment-provider contract, inbound event inbox, refund, payout and ledger records. Idempotency/order/provider event uniqueness constraints exist in schema; model presence does not prove a provider is configured or money movement works. |
| `Payment` | Booking-level payment status/provenance, amount, order/gateway refs, payout status and demo metadata. Unique booking/order/demo reference as declared. |
| `Dispute`, `DisputeRevisionAuthorization`, `DisputeEvent`, `DisputeClarification`, `DisputeReportEvidence`, `DisputeMessageEvidence`, `DisputeEvidenceAccess`, `DisputeAppeal`, `DisputeAppealEvent` | Case lifecycle, allowed revision authorization, immutable-style events, clarification, linked report/message evidence, evidence access audit and appeal/assignment/decision history. Composite booking/id relationships and per-dispute appellant uniqueness constrain ownership and duplicates. |
| `Review` | Booking review tied to service, seller and reviewer; booking unique; service/seller indexed. |
| `Conversation`, `Message` | Service/customer/seller conversation and messages with moderation flags. One conversation per service/customer; messages indexed by conversation/time. |
| `Notification`, `NotificationOutbox` | User notifications and event-key/outbox delivery state. Outbox event key unique; status/availability and claim-expiry indexes. |
| `Report`, `Feedback`, `ActivityLog` | Moderation/report workflow, optional user feedback, and actor/action audit records. Reports indexed by status/time and target; logs indexed by action/time and target. |

Important policy: `Role` contains only `USER` and `ADMIN`; seller is represented through `SellerProfile` and approval status, not a distinct role enum. Service public eligibility applies multiple gates in [`catalog.service.ts`](../src/modules/catalog/catalog.service.ts): service active, not hidden, moderation approved, active category and approved seller. The exact gate is enforced in code, not inferred from schema alone.

### Enum inventory

Enums and values are defined at the beginning and lifecycle sections of `schema.prisma`: `Role`, `AccountStatus`, `VerificationStatus`, `SellerActivationReviewStatus`, `ModerationStatus`, `ServiceStatus`, `BookingStatus`, `PaymentStatus`, `PayoutStatus`, `AdditionalRevisionRequestStatus`, `AdditionalRevisionOfferStatus`, `AdditionalRevisionAgreementStatus`, `PaymentProvenance`, `PaymentRefundStatus`, `SellerPayoutStatus`, `FlagSeverity`, `NotificationType`, `ReportTarget`, `ReportStatus`, `CancellationRequestStatus`, `DisputeCategory`, `DisputeStatus`, `DisputeNextAction`, `DisputeClarificationRecipient`, `DisputeClarificationStatus`, `DisputeRevisionAuthorizationStatus`, `AppealStatus`, `AppealOutcome`, `BookingReviewJobStatus`, `DeliveryCycleStatus`, `DeliveryCycleJobStatus`, `RevisionStatus`, `RevisionClarificationStatus`, `RevisionClarificationRequester`, `RevisionQuotaOperation`, `RevisionEscalationTrigger`, `RevisionEscalationStatus`, `RevisionResponseClockType`, `RevisionEscalationActorType`, and `NotificationOutboxStatus`.

Notable value sets include booking `REQUESTED/ACCEPTED/DECLINED/PAID/DELIVERED/COMPLETED/CANCELLED`; payment `PENDING/PAID/DEMO_PAID/FAILED/EXPIRED/REFUND_PENDING/REFUNDED`; assistance `OPEN/IN_REVIEW/RESOLVED/CLOSED`; and revision clock types `SELLER_RESPONSE/CUSTOMER_CLARIFICATION`.

## 7. API Endpoint Inventory

Routes below are actual Express registrations. `/api/auth` and `/api/sellers` are mounted as written; `/api/services` is the service router; booking, catalog, reviews, reports, conversation, notification, portfolio, and availability routes below are mounted under `/api/v1` except where noted. Route registration proves a handler exists, not live availability. Input schemas are in each module's `*.schema.ts`; response envelopes and controller behavior are in the corresponding controller/mapper.

Auth statuses: **Public** means no authentication middleware on the route. **USER** is authenticated account role; seller capability and approval may add middleware. **ADMIN** is authenticated admin role. Controllers additionally check ownership and state; exact failure status is not uniform (typically 401 unauthenticated, 403 unauthorized capability, 404 concealed/missing owned resource, 409 state conflict, 400/422 validation depending handler).

### Auth and account — `/api/auth`

| Method and path | Access | Purpose/important contract |
|---|---|---|
| `POST /register`, `POST /login` | Public; login rate-limited | Register/login; Zod request schemas, password hashing, access token response. |
| `GET /me`, `PATCH /me`, `DELETE /me` | Authenticated owner | Current account read/update/delete; patch is schema-validated and session-bound. |
| `POST /change-password`, `POST /logout-all` | Authenticated owner | Password rotation; logout-all increments token version and invalidates all sessions for the account. |
| `GET/PATCH/DELETE /me/discovery-location` | Authenticated owner | Private discovery location read/update/clear, location schema validated. |
| `POST /password/forgot`, `/password/verify-otp`, `/password/reset` | Public; OTP rate-limited | Recovery request/verification/reset; mode and token policy are configuration-controlled. |

### Seller profile, activation, portfolio — `/api/sellers`

| Method and path | Access | Purpose/important contract |
|---|---|---|
| `POST /apply` | Authenticated | Create seller profile from validated profile fields. |
| `GET/PATCH /me` | Authenticated owner | Read/update own seller profile; controller uses current auth user. |
| `GET /me/verification`, `POST /me/verification` | Authenticated; submit route USER | Legacy identity verification read; submit returns unavailable in current implementation. |
| `GET/POST/DELETE /me/activation-review` | Authenticated USER with own seller profile | Read, submit/resubmit, withdraw current non-identity activation review. Submission captures current profile/portfolio/service-offer snapshots and hash. |
| `GET /admin/activation-reviews`, `GET /admin/activation-reviews/:review_id`, `PATCH /admin/activation-reviews/:review_id` | ADMIN | Queue, detail, approve/reject decisions; reviewer cannot act outside route/control checks; schema validates decisions/rejection reason. |
| `GET /admin/verifications`, `GET /admin/verifications/:id/document`, `PATCH /admin/verifications/:id` | ADMIN | Legacy identity endpoints currently unavailable; do not describe as live seller approval workflow. |
| `GET /:id` | Public | Public seller profile, controller filters/serializes response. |
| `GET/POST/PATCH/DELETE /me/portfolio[/:item_id]` | Authenticated USER + own seller profile | Seller-owned portfolio CRUD; controller verifies ownership. |

### Services, catalog, and saved items

`/api/services` routes:

| Method and path | Access | Purpose/important contract |
|---|---|---|
| `GET /categories`, `GET /`, `GET /:id` | Public | Categories, listing, service detail. List schema supports query/search, region/category, sort (`newest`, `price_asc`, `price_desc`, `rating`) and pagination fields. Public catalog canonical routes are also `/api/v1/services`, `/api/v1/services/:service_id`. |
| `GET /mine`, `POST /` | Authenticated USER + seller profile | Own service listing and create. Profile required; approval gate is not attached at route declaration. |
| `PATCH/DELETE /:id` | Authenticated USER + seller profile | Update/delete; controllers check service ownership and protect active booking references. |
| `PATCH /:id/status`, `/visibility`, `/active` | Authenticated approved seller | Update availability, hide/show, active state; ownership checked in controller. |
| `GET/POST /:id/availability`, `PATCH/DELETE /:id/availability/:slotId` | Authenticated approved seller | Own service availability-slot list/create/update/delete; overlap and ownership validation in controller/schema. |
| `GET /admin/moderation`, `PATCH /admin/moderation/:id` | ADMIN | Moderation queue/decision. |

`/api/v1` catalog routes:

| Method and path | Access | Purpose/important contract |
|---|---|---|
| `GET /services`, `GET /services/:service_id`, `GET /creators/:seller_profile_id`, `GET /catalog/facets` | Public | Public catalog list/detail, creator profile, category/city facets. Catalog service enforces publication/moderation/seller approval gates. |
| `GET /me/favorites`, `PUT/DELETE /me/favorites/:service_id` | Authenticated owner | List/add/remove current user's favorites. |
| `GET /me/cart`, `PUT/DELETE /me/cart/:service_id` | Authenticated owner | List/add/remove current user's cart rows. Cart does not reserve availability or create bookings. |

### Booking and lifecycle — `/api/v1`

| Method and path | Access | Purpose/important contract |
|---|---|---|
| `POST /services/:service_id/booking-validation` | Authenticated USER | Server validates booking eligibility and returns current quote/revision policy to acknowledge. |
| `POST /bookings` | Authenticated USER | Create booking; schema includes service id and revision policy hash plus booking fields; controller owns price/eligibility/status. |
| `GET /me/bookings`, `GET /me/bookings/:booking_id` | Authenticated USER, customer ownership | Customer booking list/detail scoped to current account. |
| `POST /me/bookings/:booking_id/complete` | Authenticated USER, booking customer | Customer completion acceptance subject to server state, timers and blockers. |
| `POST /me/bookings/:booking_id/cancellation-requests` | Authenticated USER, customer ownership | Submit cancellation reason and evidence upload; request does not itself change payment/refund state. |
| `GET /seller/bookings`, `GET /seller/bookings/:booking_id` | Authenticated approved seller, own seller booking | Seller list/detail. |
| `POST /seller/bookings/:booking_id/accept`, `/decline`, `/deliver` | Authenticated approved seller, owner/state checked | Seller decision/delivery transitions. Accept schema carries expected status and price-related validation; delivery content contract is limited to implemented schema. |
| `GET/POST /me/bookings/:booking_id/revisions`; `POST .../:revision_id/withdraw`, `/accept-rejection`, `/clarifications`, `/clarifications/:clarification_id/respond`, `/assistance` | Authenticated USER, customer ownership | Customer revision list/create/withdraw/rejection acknowledgement/clarification/assistance. State and deadline checks in revision controllers/services. |
| `GET /seller/bookings/:booking_id/revisions`; `POST .../:revision_id/respond`, `/deliver`, `/assistance` | Authenticated approved seller, booking ownership | Seller revision list/respond/deliver/assistance request. |
| `GET/POST /me/bookings/:booking_id/additional-revision-requests`; `POST .../:request_id/withdraw`, `/clarifications/respond`, `/offers/:offer_id/accept` | Authenticated USER, customer ownership | Customer additional-work request lifecycle. |
| `GET /seller/bookings/:booking_id/additional-revision-requests`; `POST .../:request_id/clarifications`, `/reject`, `/offers` | Authenticated approved seller, booking ownership | Seller clarification/reject/offer lifecycle. |
| `GET /admin/cancellation-requests`, `PATCH /admin/cancellation-requests/:cancellation_id` | ADMIN | Queue and decide a customer cancellation request; a decision does not itself authorize refund or payout changes. |
| `GET/POST/PATCH /admin/revision-assistance[/:assistance_id]` (GET queue/detail, PATCH transition); `POST /admin/revisions/:revision_id/system-error-quota-return` | ADMIN | Admin assistance queue/state action and narrow system-error quota return. State/version and event/receipt behavior in controller/service. |
| `POST /me/bookings/:booking_id/disputes`, `/seller/bookings/:booking_id/disputes` | Authenticated USER; customer/seller party | Create dispute from eligible booking; seller route requires seller profile; controller establishes participant and ownership. |
| `GET /me/disputes/:dispute_id`, `GET /seller/disputes/:dispute_id` | Authenticated USER, participant ownership | Party reads dispute/evidence. |
| `POST /disputes/:dispute_id/clarifications/:clarification_id/respond`, `/evidence/messages`, `/appeals`; `GET /appeals/:appeal_id` | Authenticated USER, participant/appeal owner | Party clarification response, message evidence linking, appeal submit/read. |
| `GET /admin/disputes[/:dispute_id]`, `POST /admin/disputes/:dispute_id/review`, `/clarifications`, `/decision`, `/reports` | ADMIN | Admin case queue/detail/review, request clarification, decide and link report evidence. Decision values constrained by policy; no implied payment/refund action. |
| `GET /admin/appeals[/:appeal_id]`, `POST /admin/appeals/:appeal_id/assignment`, `/decision` | ADMIN | Appeal queue/detail, reviewer assignment and decision. |
| `GET /payments/demo/availability`; `POST /me/bookings/:booking_id/demo-payment`; `POST /me/bookings/:booking_id/additional-revision-agreements/:agreement_id/demo-payment`; seller demo-start/demo-deliver and customer demo-complete routes | Authenticated USER or approved seller as declared | Explicit demo-payment/additional-work routes exist. They are not trusted gateway, QRIS, settlement, or production payment evidence. Runtime/current configuration was not verified here. |

### Other `/api/v1` modules

| Method and path | Access | Purpose |
|---|---|---|
| `PATCH /seller/services/:service_id/availability` | Authenticated approved seller; ownership | Alternate seller service availability update. |
| `POST /services/:service_id/conversations` | Authenticated USER | Create/contact service conversation; participant and duplicate controls live in controller. |
| `GET /me/conversations`, `GET/POST /conversations/:conversation_id/messages` | Authenticated participant | List conversations/messages and send message; participant ownership checked in controllers. |
| `GET /me/notifications`, `/me/notifications/unread-count`; `PATCH /me/notifications/read-all`, `/me/notifications/:notification_id/read` | Authenticated current user | Own notifications/count/read status. |
| `POST /bookings/:booking_id/review`; `GET /services/:service_id/reviews`, `/sellers/:seller_id/reviews`, `/reviews/:review_id`; `GET/PATCH/DELETE /me/reviews[/:review_id]` | Create/current review requires authenticated USER; public reads otherwise | Review eligibility and ownership checks are controller-enforced. |
| `POST /reports`, `GET /me/reports`, `GET /reports/:report_id` | Authenticated USER, own reports | Submit/read own formal reports; schema and target checks apply. |
| `GET /admin/reports`, `/admin/reports/:report_id`; `PATCH /admin/reports/:report_id` | ADMIN | Admin report queue/detail/moderation. |
| `GET/POST /api/sellers/me/portfolio`, `PATCH/DELETE /api/sellers/me/portfolio/:item_id` | Authenticated USER + own seller profile | Own portfolio CRUD, mounted under the seller router. |

Public category list is `/api/services/categories`; service list/detail also exist under `/api/services` and catalog equivalents under `/api/v1`.

## 8. Authentication and Authorization

| Control | Evidence and behavior | Status |
|---|---|---|
| Passwords | `auth.controller.ts` calls password helpers; `src/lib/password.ts` uses bcryptjs. Password hashes are not returned by user mapper. | Implemented in source; runtime not re-tested in this audit. |
| Access token | JWT helper/controller signs HS256 access tokens with subject, role and tokenVersion; middleware restricts algorithm and reloads user role/status/version. | Implemented in source. Expiry is configured in JWT helper/controller; exact deployment configuration was not checked. |
| Logout | `logoutAll` increments account tokenVersion. Frontend clears local token/session even when request fails. This revokes every extant token for that account when the backend request succeeds. | Implemented in source; disposable-account runtime revocation **unverified**. |
| 401 handling | Shared API client dispatches unauthorized event only for authenticated requests with a token; AuthProvider clears local session. 403/network/5xx are not treated as logout. | Focused tests reported 10/10 pass; no browser runtime check here. |
| Roles/capability | Backend `requireRole` checks `USER`/`ADMIN`; seller checks fetch profile and sometimes `verificationStatus=APPROVED`. Frontend `RequireAccount/RequireSeller/RequireAdmin` protects user experience. | Implemented; backend remains final control. |
| Ownership | Controllers/services query by current authenticated user, seller profile, booking participant, or resource owner; some return 404 to conceal existence. | Broad 27/27 authorization runtime checks are reported historical evidence; no re-execution during documentation audit. |
| Public service visibility | Active service, not hidden, moderation `APPROVED`, active category and approved seller are required by catalog predicate. | Implemented in source (`catalog.service.ts`). |
| Admin permissions | Backend uses database `Role.ADMIN`; frontend route uses its current session/capability representation. | Implemented; do not confuse development-only local admin tools in the old frontend docs with server admin provisioning. |

## 9. Business Workflow Inventory

### Authentication and seller activation

1. User registers/logs in, receives access token and can restore account via `/api/auth/me`.
2. User applies for seller profile (`POST /api/sellers/apply`); profile is associated with authenticated owner.
3. Seller prepares profile/portfolio/service offers and submits activation review. The review snapshots profile, portfolio and service offers and computes a hash. Admin reviews and approves/rejects; seller may withdraw subject to active state.
4. Seller activation review is non-identity. Legacy `SellerVerification` exists in schema, but current verification endpoints return unavailable; it is not the active seller-activation requirement.
5. Public listing requires approved seller and independently approved service moderation plus active/not hidden/category gates.

### Catalog, favorites, cart, service management

Public catalog/facets/details and creator profile are GET routes. Favorites and cart are authenticated server-owned rows via API. Seller service CRUD and availability are separate endpoints, with service ownership checks; CRUD/profile routes sometimes require seller profile while availability/operational seller actions require approved status. Service moderation is independent of activation. Cart is a saved selection, not an inventory reservation or booking.

### Booking, pricing, payment and delivery

Booking validation is performed server-side before create and returns current estimated pricing/revision policy; booking create requires the policy hash and customer acknowledgement. Booking status is server-owned. Seller accepts/declines; payment-related state may be updated only through explicit payment code paths. Demo routes are distinct from trusted provider integration. Delivery-cycle/review/completion checks use server-side state, deadlines, receipts and scheduler. No production gateway/webhook or settlement verification is asserted.

### Revision and admin assistance — approved response-clock rule

The approved policy says customer/seller response deadlines pause while revision admin assistance is `OPEN` or `IN_REVIEW`, and resume with exactly the stored remaining milliseconds after assistance ends if no other blocker remains; the deadline is not restarted.

**Source verification: implemented in source.** `revision-response-clock.ts` computes remaining milliseconds from the current deadline at pause, persists `remainingMs` and `pausedAt`, and on resume calculates a new deadline from current time plus that exact remainder, recording `restoredDeadlineAt`. `hasPausedResponseClock` also considers active-assistance count; the assistance state machine defines `OPEN → IN_REVIEW → RESOLVED → CLOSED` and `RESOLVED → IN_REVIEW` reopen. `revision-assistance.controller.ts` synchronizes clocks on transitions. This is static source evidence; it does not replace runtime verification of all concurrent/multiple-blocker cases.

### Dispute, appeal, review and messaging

Disputes are party-created/read and admin-reviewed/decided, with clarification/evidence and appeal entities/events. Admin dispute decisions carry permitted workflow next actions; do not infer automatic refund, payout, or payment mutation. Reviews require an eligible completed booking and customer ownership. Conversation/message controllers enforce participant roles. Notifications/outbox have persisted backend models and routes; the frontend feature matrix still describes review/messaging as local/demo and notification connection not verified, so end-to-end integration is incomplete.

### Cancellation and moderation

Customer cancellation creates a reason/evidence request; admin route decides that request. A cancellation decision is not a refund instruction. Admin service moderation changes moderation state; public catalog gating is independent of seller approval and seller availability.

## 10. Configuration Inventory

Names/function only; values were not read, printed, or included.

| Variable | Consumer / meaning |
|---|---|
| `PORT` | Backend HTTP listener; default 3000 in `server.ts`. |
| `CORS_ORIGIN` | Express CORS allowed origin; default localhost Vite origin. |
| `DATABASE_URL` | Backend runtime PrismaPg PostgreSQL connection. |
| `DIRECT_URL` | Prisma CLI datasource in `prisma7.config.ts`; config adds SSL/CA strict parameters. |
| `DIRECT_URL_CONCURRENCY_TEST` | Runtime only when `NODE_ENV=test`; `config/prisma.ts` validates local disposable DB identity before constructing adapter. |
| `JWT_SECRET` | JWT issuance and verification; middleware rejects missing/short configuration. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Storage REST host and service authorization. Secret value must not be exposed. |
| `SUPABASE_BUCKET_KTP`, `SUPABASE_BUCKET_CANCELLATION_EVIDENCE` | Private storage bucket names for corresponding upload flows. |
| `NIK_ENCRYPTION_KEY` | Legacy identity data crypto helper; no implication this is required by current non-identity activation. |
| `OTP_MODE` | Password recovery mode; simulated only outside production per controller. |
| `PAYMENT_DEMO_MODE` | Controls explicit additional/booking demo payment code paths outside production; payment runtime not verified. |
| `BOOKING_SCHEDULER_ENABLED` | Exact `false` disables scheduler startup; unset preserves default startup. |
| `NODE_ENV` | Test runtime and production-mode checks. |
| `VITE_API_BASE_URL` | Frontend shared API client base URL; defaults to local backend port 3000. |
| `VITE_ENABLE_DEMO_PAYMENT` | Frontend local/demo customer store option (`customerClient.js`) can enable browser simulation; this legacy/demo store is not the integrated backend payment authority. |

Prisma CLI loads dotenv via `prisma7.config.ts`; runtime server loads `dotenv/config` in `server.ts`. This audit did not inspect `.env` values or establish the current process environment or database target.

## 11. Testing and Verification Status

The following are the latest supplied/report-recorded results, not commands rerun in this documentation phase.

| Check | Latest known result | Evidence boundary |
|---|---|---|
| Authorization runtime suite | 27/27 passed | Historical runtime check using existing test accounts; not repeated here. |
| Focused frontend authentication/API tests | 10 passed | Tests exercise shared API/auth adapter behavior (including 401 handling) with mocks; not live HTTP. |
| Full frontend test suite after triage | 237 passed, 49 failed, 286 total | Latest two runs reported same 49 failures in project history. No pre-change baseline. Causes are mixed/not fully confirmed; do not call all pre-existing or all product defects. |
| ESLint on changed files | Passed | Scoped lint, not necessarily entire project lint. |
| Production frontend build | Passed | Emits advisory for a minified JS bundle over 500 kB. |
| Browser visual walkthrough | Incomplete / not verified comprehensively | No claim of full browser rendering, console, and network walkthrough. |
| Runtime `logout-all` | Not verified | No disposable account revocation test recorded. Logout-all revokes every account session. |
| Booking/payment runtime | Not fully verified | Adapter mocks and historical backend isolated tests do not establish full current Supabase end-to-end behavior. |
| Backend tests | Historical isolated evidence exists | `backend/package.json` currently defines `test` as placeholder (`echo ... && exit 1`); past focused test invocations are documented under frontend Phase 5.9.9 known issues and backend phase reports in earlier history, but backend `/docs` directory was absent in the inspected active workspace. |
| Database/migration | Not run in this audit | No database connection, query, migration or seeder was executed. |

## 12. Known Limitations and Technical Debt

1. **Not production-ready on evidence available.** Current docs explicitly say production readiness is not established.
2. **Payment/finance:** no trusted production gateway/webhook/QRIS, refunds, wallet/commission settlement or payout execution verified. Models and demo endpoints do not prove these are operational.
3. **Frontend integration gaps:** disputes, appeals and admin assistance lack integrated formal case screens; review/messaging clients remain local/demo according to latest feature matrix; notification backend integration is not verified.
4. **Frontend suite:** 49/286 failures remain after triage; reproducible list, no baseline, cause attribution unresolved. Need review each test/application contract before final regression.
5. **Browser/runtime:** complete visual, console, network and end-to-end customer/seller flow not verified. Auth logout-all runtime not exercised with a disposable account.
6. **Test tooling:** backend package-level `npm test` is not a real test runner. Build/typecheck scripts call Prisma generation; explicit test invocation should use documented safe config and isolate database where relevant.
7. **Bundle size:** build succeeds but exceeds 500 kB chunk advisory.
8. **Booking retry contract:** frontend handover docs note no verified booking-create idempotency key; avoid automatic replay after ambiguous network failure unless current backend contract confirms it.
9. **Storage:** Supabase storage functions are present, but bucket setup, policies, retention, credentials, and live file handling were not verified.
10. **Schema/live drift:** no live introspection in this audit; schema/migration files only.

## 13. Legacy Components and Owner Confirmation Notes

| Item | Finding | Status / owner question |
|---|---|---|
| Identity verification | `SellerVerification` stores encrypted NIK metadata and a KTP document path. The old `/me/verification` and admin verification routes currently return unavailable. Separate `SellerActivationReview` is explicitly non-identity and is the active approval mechanism in source. | **Legacy compatibility.** Confirm whether legacy model/data should remain for historical records or be retired in a future separately authorized schema phase. Do not restore identity requirements through seller activation. |
| Demo/local frontend stores | Account, customer, seller, reviews, messages, payout estimate and other stores remain in source for compatibility or demo surfaces. Some current pages have backend adapters. | **Mixed/partially legacy.** Produce an ownership-by-feature map before claiming all business data is backend-authoritative. |
| Demo payment | Demo payment routes and schema provenance values exist. | **Development-only/limited.** Confirm whether demo flow is permitted in the deployed development environment; do not treat it as real payment. |
| Formal-case UI | Backend dispute/appeal/admin-assistance endpoints exist, but frontend matrix marks formal workflow UI unavailable. | **Backend implemented; frontend planned/unavailable.** Confirm product UI scope before creating academic feature claims. |
| Project research | No verified survey, interviews, or user-test dataset was found in the inspected documents. | Owner must provide authentic methodology/results or omit those claims. |
| Project title/team/academic metadata | Package metadata does not establish final institution, course, team member names, supervisor, or submission date. | Owner confirmation required for academic report. |
| Database target | Project reference is owner-provided approved context. No database connection or current target validation was made. | Do not represent this audit as Supabase verification. |

## 14. Documentation Readiness

**Audit readiness: sufficient for drafting Phase 2 technical documentation with explicit verification labels.** The repository has a usable schema, route modules, feature READMEs and a Phase 5.9.9 handover/feature matrix. The audit also identifies substantial integration/test limits that must be carried into any generated documentation.

**Academic/hackathon documentation readiness: partial.** Technical implementation can be described accurately, but background research, problem validation, methodology, actual user evaluation, screenshots/results, team/supervisor/institution metadata, and approved final scope need owner evidence. Do not fabricate them.

## 15. Recommended Documentation Structure

### Technical Developer Documentation

1. `README.md`: product summary, workspace structure, prerequisites, installation and safe local start.
2. `architecture/overview.md`: components, request/data flow, auth, persistence, storage and scheduler.
3. `architecture/database.md`: model groups, ER diagram generated from the actual Prisma schema, constraints and migration policy.
4. `api/auth.md`, `api/catalog.md`, `api/seller.md`, `api/booking-lifecycle.md`, `api/admin.md`: endpoint contracts from routes/controllers/schemas with auth and error cases.
5. `workflows/`: seller activation, booking, revisions/assistance, disputes/appeals, cancellation, reviews, payment boundaries.
6. `frontend/`: routes, providers, API client, feature persistence map and server-backed versus local/demo features.
7. `operations/configuration.md`: variable names, secrets handling, TLS, scheduler guard, logs and storage setup without committing secret values.
8. `testing/verification-matrix.md`: command, environment, mock/integration/runtime scope and known failed checks.
9. `limitations/roadmap.md`: payment, UI integrations, test failures, browser verification and production gates.

### Academic/Hackathon Documentation

1. Cover/title page (owner-confirmed project/team/institution metadata).
2. Executive summary and verified problem framing (no unsupported survey claims).
3. Product objectives, scope, target actors and requirements.
4. Methodology actually used (development process, evidence collection and evaluation methods).
5. System design: architecture diagram, ER diagram, use cases and main workflows.
6. Implementation chapters: customer discovery, seller center, booking/revision/admin lifecycle and technical controls.
7. Testing/evaluation: reproducible results, test types, limitations and failed cases.
8. Results/screenshots from authorized actual environment, labeled as demo or production appropriately.
9. Limitations, security/privacy considerations, future work and conclusion.
10. References and appendices (API summary, selected schema/diagrams, test matrix; no credentials or personal data).

### Existing documentation inventory

| Document location | Reuse value | Reconciliation needed |
|---|---|---|
| `frontend_fix/frontend/docs/phase-5.9.9/FEATURE_STATUS.md` | Current concise feature and integration matrix. | Align with any newer completed implementation and latest 237/49 suite result supplied for this audit. |
| `frontend_fix/frontend/docs/phase-5.9.9/BUSINESS_RULES_AND_LIMITATIONS.md` | Approved server ownership, identity and payment boundaries. | Keep aligned with current endpoints and latest active runtime scope. |
| `frontend_fix/frontend/docs/phase-5.9.9/TESTING_AND_KNOWN_ISSUES.md` | Useful test commands and provenance notes. | Historical full suite says 202/268 and 66 failed; add the latest triage record (237/286, 49 failed) only in a future documentation update, preserving historical chronology. |
| `frontend_fix/frontend/docs/phase-5.9.9/REMAINING_WORK.md`, `FINAL_HANDOVER_REPORT.md` | Handover/production-readiness context. | Contains state snapshots that can become stale; label phase/date and reconcile before treating as current. |
| `frontend_fix/frontend/src/features/{account,customer,seller,profile,location,messaging,reviews}/README.md` | Feature-level implementation notes and known persistence constraints. | Some are older local-store descriptions and may conflict with current API-backed modules; inspect and reconcile per feature rather than wholesale copying. |
| `frontend_fix/frontend/HANDOFF.md` | Detailed UI workflows and earlier architecture history. | Older sections describe browser-local booking/payment and include stale lifecycle assumptions; not authoritative over current backend. |
| `frontend_fix/frontend/docs/frontend-stability.md`, `g3-usability.md` | Stability/usability evidence. | Review chronology and test inventory before citing as current. |
| `backend/docs/` | No directory or prior report files were present in the inspected active backend workspace at audit start. | This audit creates its first consolidated inventory; prior-phase reports mentioned in conversation are not available in this workspace snapshot unless separately restored. |

## Evidence and scope limits

- Inspected source/manifests: backend `package.json`, lockfile, `prisma/schema.prisma`, migration directory names, Prisma configuration, server/app/middleware, module routes/controllers/schemas/services, and frontend manifests, routes, API client/adapters and docs.
- `.env` and credential file contents were not read. No secret or environment value is included.
- No database, Supabase, storage, runtime server, scheduler, migration, seeder, booking, payment, or Git command was used in this audit.
- Test/build figures in section 11 are supplied or recorded phase evidence, not rerun results from this audit.

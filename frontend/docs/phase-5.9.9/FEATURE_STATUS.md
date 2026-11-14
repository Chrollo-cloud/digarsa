# DIGARSA Feature Status

This matrix distinguishes source implementation from live verification. “Implemented and verified” for backend lifecycle items refers to the isolated local test evidence recorded in the backend phase reports. It does not mean production or deployed behavior was verified.

| Feature | Status | Current evidence and limits |
|---|---|---|
| Authentication and authorization | Implemented but not live-verified | Frontend registration/login/current-user/profile APIs use the backend and bearer token. Backend routes apply authentication and role checks. Latest frontend phases did not exercise them against a running backend. |
| Public marketplace and service details | Implemented but not live-verified | Current catalog adapter and pages request public services, creator profiles, facets, search/filter, and cursor pages from the backend. No live catalog request was run in Phase 5.9.7/5.9.8. |
| Customer and seller profiles | Implemented but not live-verified | Customer profile updates use `/api/auth/me`; seller profile preparation uses `/api/sellers` endpoints. The implementation is source-backed but latest live behavior was not tested. |
| Favorites and cart | Implemented but not live-verified | Current saved-items store uses backend favorites/cart APIs. Cart is not checkout; availability is advisory and booking validation is the final gate. |
| Booking validation and creation | Implemented but not live-verified | Frontend calls backend validation, displays server estimate/policy, and submits the server policy hash and acknowledgement. Phase 5.9.8 tested the adapter with mocked responses only. |
| Customer booking list and details | Implemented but not live-verified | Uses authenticated customer list/detail endpoints, server statuses, cursor metadata, and supported customer actions. No live HTTP flow was run in the frontend phases. |
| Seller booking list and details | Implemented but not live-verified | Uses authenticated approved-seller endpoints and server booking data. Live seller session/ownership behavior was not tested in Phase 5.9.7/5.9.8. |
| Seller accept and decline | Implemented but not live-verified | Uses backend accept/decline actions and expected status. The seller adapter and authorization-error behavior have mock coverage. |
| Customer completion and cancellation requests | Implemented but not live-verified | Completion calls the server-owned completion endpoint; cancellation submits a reason and evidence file. A cancellation request does not itself decide a refund. |
| Revision requests and responses | Partially implemented | Customer/seller revision list and supported request/response/clarification UI is connected. Other backend actions, including some withdrawal, rejection follow-up, revised delivery, and assistance actions, are not all represented in the frontend. |
| Dispute and appeal backend | Implemented and verified | Backend routes, policy, and lifecycle have isolated unit, HTTP, and PostgreSQL evidence recorded in Phase 5.9.6.5.1/.2/.3 reports. Not production-verified. |
| Admin assistance backend | Implemented and verified | Backend routes and response-clock lifecycle exist; local unit evidence is recorded in the backend readiness report. Not production-verified. |
| Dispute, appeal, and admin-assistance frontend | Disabled or unavailable | No integrated formal case screens are connected. Do not substitute ordinary chat or generic reports for formal workflows. |
| Payment and QRIS | Not implemented | No trusted gateway/webhook/payment confirmation flow was verified. Checkout/payment demo success is disabled in the integrated booking path. |
| Delivery artifacts and uploads | Disabled or unavailable | No verified booking delivery-content/artifact contract exists. Seller delivery submission must remain unavailable. |
| Wallet, commission, refunds, and payout | Not implemented | Trusted financial processing is absent. Older demo code is not a real balance, settlement, refund, or payout service; integrated finance actions remain unavailable. |
| Reviews, notifications, and messaging | Partially implemented | Backend route modules exist, but the current frontend review and messaging clients use local/demo stores; current notification UX is not verified as connected to the backend. |
| Seller verification and activation | Partially implemented | Seller profile/portfolio preparation and activation submission/status UI use backend APIs. Backend admin review routes exist. Identity verification/document routes are unavailable; no government identity document is required. |

## Evidence boundary

The customer/seller booking API adapter tests are mocked. The Phase 5.9.8 full frontend test suite result was 202/268 passed with 66 failures and no pre-change baseline. Prior backend PostgreSQL and HTTP results are historical isolated test evidence, not a current live or production check.

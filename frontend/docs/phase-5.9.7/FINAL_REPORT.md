# DIGARSA Phase 5.9.7 — Frontend Booking Integration

## Status

**PARTIALLY COMPLETE.** The core non-payment customer and seller booking flows now use the verified backend APIs. Payment/checkout, booking delivery content, dispute/appeal UI, and admin assistance UI remain unavailable because their required frontend/backend contracts are outside this phase or not exposed to the relevant party view. Live integration was not verified because no approved backend runtime was started.

## Implemented flows

### Customer

- Service details now link to booking initiation only when the public catalog marks the service bookable. The server rechecks availability during validation and creation.
- Booking request calls `POST /api/v1/services/:service_id/booking-validation`, shows the server estimate and revision policy, and requires acknowledgement of that policy.
- Creation calls `POST /api/v1/bookings` with the server policy hash, `revision_policy_acknowledged: true`, and `confirmed: true`. No price or creator identity is sent by the browser.
- After creation, navigation opens the booking detail route, which fetches the persisted record with `GET /api/v1/me/bookings/:booking_id`.
- Customer list and dashboard use `GET /api/v1/me/bookings`; the list respects backend status filtering, opaque cursors, `has_more`, and `total`.
- Detail shows server booking status, estimate, payment status as read-only information, and server-provided delivery-cycle deadline/pause fields when present. Completion calls the verified completion endpoint and refreshes server data.
- Cancellation requests send the required reason and evidence file as multipart form data through the centralized API client.
- Customer revision requests, revision history, and responses to seller-requested revision clarifications use the existing backend endpoints and returned server state/deadlines.
- An ambiguous network failure during booking creation does not trigger an automatic retry. The UI directs the customer to check the server booking list before manually restarting the request.

### Seller

- Seller overview, incoming booking list, and booking detail now read the authenticated seller endpoints. Lists use server status filters, cursor pagination, and server totals.
- Accept and decline use the actual server actions. Accept does not ask the seller to set a final price because the backend accepts no such field.
- Seller revision lists and supported accept/reject/clarification responses use the verified routes and validation fields.
- `useAutoComplete` was removed from the customer/seller booking integration path. Browser-local timers no longer complete bookings.

## Disabled or not integrated

- Checkout and the former demo payment page now explain that no payment was started or recorded. No browser action can mark a booking `PAID`.
- Seller earnings, wallet, withdrawal, payout history, and admin payment/payout screens no longer show or mutate demo balances or transfers.
- Seller delivery submission remains unavailable: the verified booking delivery route has no delivery-note or artifact contract. No file upload or fake delivery-success UI was added.
- Booking monitor/admin overview demo booking data is hidden because no verified all-bookings admin listing endpoint exists.
- No formal frontend dispute/appeal or admin-assistance panel existed to connect. The available backend case APIs remain authoritative; ordinary messaging was not presented as a formal case action. Party-readable assistance status is not present in the verified booking/revision DTO, so no assistance status was invented.
- Finance screens, account/profile areas outside the scoped booking components, seller service-management screens, messaging, notifications, and reviews are not claimed as integrated by this phase. In particular, legacy demo state still exists in the codebase, but the integrated booking pages no longer use it as their booking authority.

## Backend endpoints used

- `POST /api/v1/services/:service_id/booking-validation`
- `POST /api/v1/bookings`
- `GET /api/v1/me/bookings`, `GET /api/v1/me/bookings/:booking_id`
- `GET /api/v1/seller/bookings`, `GET /api/v1/seller/bookings/:booking_id`
- `POST /api/v1/seller/bookings/:booking_id/accept`
- `POST /api/v1/seller/bookings/:booking_id/decline`
- `POST /api/v1/me/bookings/:booking_id/complete`
- `POST /api/v1/me/bookings/:booking_id/cancellation-requests` (multipart `reason` and `evidence`)
- `GET /api/v1/me/bookings/:booking_id/revisions`
- `POST /api/v1/me/bookings/:booking_id/revisions`
- `GET /api/v1/seller/bookings/:booking_id/revisions`
- `POST /api/v1/seller/bookings/:booking_id/revisions/:revision_id/respond`
- `POST /api/v1/me/bookings/:booking_id/revisions/:revision_id/clarifications/:clarification_id/respond`

The application prefixes these booking routes with `/api/v1`. Requests reuse `src/lib/apiClient.js` and existing auth-token handling. The adapter maps backend snake_case DTOs and preserves unknown status strings instead of mapping them to a success state.

## Verification

- `npm.cmd run build` — **PASS**. Vite emitted its advisory that one existing output chunk is larger than 500 kB; build completed successfully.
- Focused ESLint on changed source and test files — **PASS**, no errors or warnings.
- `node --test tests\booking-api.test.js` — **5/5 PASS**. Covers status/optional-field mapping, cursor/status query encoding, validation and creation payloads, safe error guidance, and multipart cancellation through the shared API client.
- No component-render tests were added because the project has no configured React component testing library. Loading, empty, error, success, and disabled states are implemented in the pages but not all were exercised by rendered UI tests.
- No live backend HTTP call was made. Backend startup and database identity were not verified in this phase. Runtime integration is **NOT VERIFIED**.

## Remaining blockers

1. Trusted QRIS/payment gateway, webhook confirmation, refunds, wallet, commission settlement, and payout APIs are absent. Do not enable checkout or infer payment success.
2. Backend booking delivery content/artifact contract is absent. Seller delivery UI must remain unavailable.
3. Dispute/appeal and admin-assistance UI remains to be designed/integrated against the exact case and status contracts; do not substitute chat.
4. Booking creation has no idempotency key. The UI prevents automatic retry after an ambiguous network result and asks the customer to inspect bookings first.
5. Live service requests, role/session behavior against the backend runtime, and error states against actual responses remain **NOT VERIFIED**.

## Changed files

- `src/lib/apiClient.js`
- `src/features/bookings/bookingApi.js` (new)
- `src/features/bookings/useBookingList.js` (new)
- `src/pages/marketplace/ServiceDetailPage.jsx`
- `src/features/customer/BookingRequestPage.jsx`
- `src/features/customer/BookingCard.jsx`
- `src/features/customer/BookingDetailPage.jsx`
- `src/features/customer/OrdersPage.jsx`
- `src/features/customer/DashboardPage.jsx`
- `src/features/customer/CustomerFrame.jsx`
- `src/features/customer/useCustomer.js`
- `src/features/customer/bookingLifecycle.js`
- `src/features/customer/CheckoutPage.jsx`
- `src/features/customer/PaymentPage.jsx`
- `src/features/seller/SellerOrdersPage.jsx`
- `src/features/seller/SellerOrderDetailPage.jsx`
- `src/features/seller/SellerOverviewPage.jsx`
- `src/features/seller/SellerCenter.jsx`
- `src/features/seller/SellerFrame.jsx`
- `src/features/seller/useSeller.js`
- `src/features/seller/UnsupportedFinancePage.jsx` (new)
- `src/features/admin/AdminOverviewPage.jsx`
- `src/features/admin/AdminOrdersPage.jsx`
- `src/features/admin/AdminPaymentsPage.jsx`
- `src/features/admin/AdminPayoutsPage.jsx`
- `tests/booking-api.test.js` (new)
- `docs/phase-5.9.7/FINAL_REPORT.md` (this report)

No backend source, database, migration, dependency, environment file, or Git state was changed. `frontend/dist/` was generated by the production build.

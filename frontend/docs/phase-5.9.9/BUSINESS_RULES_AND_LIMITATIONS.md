# Business Rules and System Limitations

## Server-owned decisions

- The backend is authoritative for booking ownership, availability, validation, allowed actions, status transitions, and completion.
- Customer and seller actions remain subject to backend authentication, ownership, role, approval, state, and request validation.
- The browser must not create its own completion timers or mark work complete based on local elapsed time.
- Delivery-cycle deadlines, active blockers, pause/resume state, and scheduler decisions are server-owned.
- Revision policy snapshots, hashes, quota reservations, quota ledger entries, and revision state are server-owned. The customer acknowledges the policy returned by booking validation.
- Booking creation has no verified idempotency key. Do not automatically replay a create request after an ambiguous network failure; ask the customer to check the server booking list.

## Formal support workflows

- Disputes, appeals, cancellation review, and admin assistance are formal workflows with status, authorization, evidence, and history. They must not be represented as ordinary chat messages.
- A generic report is not automatically a dispute.
- Admin dispute/cancellation actions must not change payment or payout state. Any future financial behavior needs a separate verified and authorized contract.

## Payment and delivery boundaries

- Payment status shown by the frontend is read-only. Frontend code must not create payment success, set `PAID`, or simulate checkout completion.
- No trusted payment gateway, QRIS, webhook confirmation, refund, wallet, commission settlement, or payout execution was verified.
- The current backend booking contract does not define delivery notes or artifact/file uploads. Do not fabricate fields or display a fake delivery success state.
- A customer cancellation request is a request for review; it is not a refund decision.

## Identity and privacy

- Seller activation is based on the implemented seller profile, portfolio, and service-offer review contract.
- No KTP, NIK, or government identity-document requirement is part of the approved seller activation flow. Identity verification/document routes in the current backend are unavailable and must not be reintroduced as a substitute.
- Do not expose credentials, access tokens, private account fields, or historical identity data in public or review responses.

## Verification limits

- Phase 5.9.7 and 5.9.8 did not make live frontend HTTP requests. Their focused frontend adapter tests use mocks.
- Backend local test evidence does not prove production deployment behavior, live configuration, or deployment safety.
- The Phase 5.9.8 full frontend suite reported 66 failures without a pre-change baseline. They cannot be called pre-existing or attributed to this phase based on available evidence.
- The build passed but warned that its main minified JavaScript chunk exceeded 500 kB.

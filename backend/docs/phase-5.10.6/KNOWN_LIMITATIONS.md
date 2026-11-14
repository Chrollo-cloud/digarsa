# Phase 5.10.6 — Known Limitations

This note records deployment and test limitations identified during the final pre-push review. It does not authorize database operations or define an unverified operational procedure.

## Migration index replacement

`20261120120001_phase5106_demo_payment_lifecycle` drops and then recreates the partial unique index `AdditionalRevisionAgreement_one_unsettled_per_booking_key`. PostgreSQL migrations in the repository's Prisma ORM 7 workflow are not wrapped in a transaction by default, and this migration has no explicit transaction. If index creation fails after the drop, the uniqueness protection may be absent. This migration must be made safe before applying it to a fresh database. The migration was not changed or run as part of this review.

## First backend administrator

The current backend seed does not provision an administrator, and no official first-admin backend bootstrap procedure is documented here. Public registration does not accept or assign the ADMIN role. Do not treat the frontend's local demo permission helper as backend administrator provisioning. The first-admin procedure remains to be established by the project owner; this note does not prescribe an unverified method.

## HTTP integration test fixtures

`tests/phase-5106-http.integration.test.ts` requires the isolated `digarsa_concurrency_test` database and creates uniquely tagged fixture records. It closes the test server and Prisma client but does not automatically remove those records; lifecycle/audit records are intentionally retained under append-only protections. Run it only against its explicitly isolated disposable test database. No integration test or database operation was run for this review.

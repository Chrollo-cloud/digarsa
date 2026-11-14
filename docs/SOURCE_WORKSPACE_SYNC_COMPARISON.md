# DIGARSA Source Workspace Comparison

Comparison performed against local HEAD `25902ef` on branch `integrated-fe-be`, before synchronization. Source roots were `D:\hackathon_plat\backend` and `D:\hackathon_plat\frontend_fix\frontend`; destination roots were this repository's `backend` and `frontend` folders. File identity was checked using SHA-256.

## Scope and exclusions

Excluded from comparison/synchronization: `.env` files, credential/token/password-named files, dependencies, generated/build/cache output, backups, local database/log/temp files, private keys, and test output. This excluded three backend backup files and the frontend `phase-5.10.6-full-test.tap` artifact. No excluded file was staged.

## Backend comparison

After exclusions: 138 source files and 122 destination files; 112 identical, 19 source-only, 3 destination-only, and 7 differing.

Source-only files selected for synchronization:

- `docs/academic/01-project-background.md` through `06-conclusion-and-future-development.md`
- `docs/PROJECT_DOCUMENTATION_AUDIT.md`, `docs/README.md`
- `docs/technical/01-project-overview.md` through `08-testing-and-known-limitations.md`
- `prisma/seed-demo-marketplace.ts` (source only; not executed)
- `src/lib/booking-scheduler-startup.ts` and `tests/booking-scheduler-startup.test.ts`

Differing files:

- Keep destination versions of `prisma/seed.ts`, `src/modules/bookings/additional-revision.schema.ts`, `src/modules/bookings/booking.controller.ts`, and `src/modules/payments/pricing-policy.ts`: the destination has the safer category-only seed, fee-aware PostgreSQL INT validation, and overflow protection.
- Synchronize `prisma7.config.ts` from source for the source's strict Prisma CLI TLS configuration.
- Synchronize `src/server.ts` from source with its scheduler startup guard; the destination currently starts the scheduler unconditionally.
- `src/modules/bookings/additional-revision.controller.ts` differs only by trailing whitespace; keep destination content.

Destination-only backend files retained: `docs/phase-5.10.6/KNOWN_LIMITATIONS.md`, `tests/additional-revision-schema.test.ts`, and `tests/pricing-policy.test.ts`.

## Frontend comparison

After excluding test output: 309 source files and 306 destination files; 284 identical, 5 source-only, 2 destination-only, and 20 differing.

Source-only files selected for synchronization:

- `src/features/seller/sellerServicesApi.js`, `sellerServicesContext.js`, `SellerServicesProvider.jsx`
- `tests/authApi.test.js`, `tests/sellerServicesApi.test.js`

The source seller service modules use the shared API client and verified service/availability routes. The destination Seller Center instead uses localStorage-backed `sellerClient`; corresponding service, availability, form, overview, `SellerCenter`, `useSeller`, and store-sync files will be synchronized from source to complete this integration.

Other differing files selected from source: `src/features/account/authApi.js`, `AuthProvider.jsx`, `profileValidation.js`, `redirects.js`, `src/features/profile/LogoutButton.jsx`, `src/lib/apiClient.js`, `tests/apiClient.test.js`, and `tests/dev-admin-plugin.test.js`. These contain the source's logout-all/401 handling, backend-compatible profile validation, safe return path, and portable test setup.

Destination versions retained to preserve newer DIGARSA integration: `src/App.jsx`, `src/features/catalog/CatalogNotice.jsx`, `src/features/seller/SellerOrderDetailPage.jsx`, `tests/additional-revision-api.test.js`, and `tests/fixtures/reviewScenario.js`. Destination-only `src/features/seller/additionalRevisionAction.js` and `tests/additional-revision-action.test.js` are also retained.

## Pre-sync decision

No source file will overwrite a destination-only integration described above. The remaining source changes are either absent or provide the missing seller service API integration, auth hardening, scheduler guard, Prisma CLI TLS setup, or project documentation. No database operation, migration, seeder, or integration test is part of this synchronization.

## Synchronization and verification

Synchronized 21 backend files and 20 frontend files from the selected source paths above. One imported frontend dev-plugin test was adjusted to accept the existing DIGARSA page label as well as the source label; the page itself was preserved.

Post-sync hash comparison: backend has 0 source-only files, 3 destination-only files, and 5 intentional differences; frontend has 0 source-only files, 2 destination-only files, and 5 intentional differences. The destination-only files and intentional differences are the newer DIGARSA integrations listed above.

Validation results:

- Focused frontend tests: 26 passed, 0 failed.
- Full frontend test suite: 289 total, 227 passed, 62 failed. There is no baseline for these failures, so this report does not attribute them to earlier work or to this sync. They remain unresolved.
- Backend isolated unit tests (scheduler guard, pricing, additional-revision validation, demo-payment utility): 14 passed, 0 failed.
- Backend TypeScript no-emit check: passed.
- ESLint for synchronized frontend source/tests: passed.
- Frontend production build: passed; Vite emitted its existing large-chunk advisory.
- No migration, seeder, database integration test, or database operation was run.

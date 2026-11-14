# Remaining Work

## Required before a production release

- Perform authenticated customer and seller HTTP tests in an approved isolated staging/runtime environment. Verify the actual backend target before any database-backed test and do not use production/shared data for test fixtures.
- Exercise authorization, ownership, status-conflict, expiry, and validation responses through the running application. The latest frontend phases only used source review and mocked adapter tests.
- Establish a reliable baseline for the 66 failed frontend tests, then investigate and resolve the failures that block the release scope. Their origin is currently unknown.
- Add rendered UI tests for booking loading, empty, validation, error, success, stale-state, and repeat-submit behavior if a suitable component testing harness is adopted.
- Complete deployment configuration, secret handling, CORS, database migration, scheduler, observability, backup, and recovery review for the actual release environment. Local reports do not establish deployment readiness.
- If the release accepts paid bookings, implement and verify a trusted payment gateway and webhook flow before enabling paid work. Keep payment status server-owned.
- If sellers must submit work through DIGARSA, define and implement a backend delivery artifact contract before exposing upload or delivery-success UI.

## Future feature development

- Connect formal dispute and appeal workflows to customer, seller, and admin UI using the existing backend case contracts.
- Connect admin assistance and cancellation review UI to their backend routes and status/history fields.
- Implement financial processing as a separately authorized project: commission accounting, refunds, wallet, payout destination, and payout execution.
- Connect review, notification, and messaging experiences to backend APIs instead of local/demo stores.
- Finish remaining revision actions that the current UI does not expose, using the backend schemas and state machine.

## Known technical debt

- Investigate the 66 full-suite frontend failures after capturing a stable baseline. Avoid attributing them to Phase 5.9.8 without evidence.
- Reduce or split the main frontend bundle; the production build currently warns that it exceeds 500 kB after minification.
- Replace or document the backend placeholder `npm test` script with an appropriate maintained test command in a separately authorized implementation task.
- Review remaining legacy/demo data paths to ensure they are not presented as authoritative server-backed state.

Do not describe the project as production-ready until release-scope work has been completed and tested in the intended environment.

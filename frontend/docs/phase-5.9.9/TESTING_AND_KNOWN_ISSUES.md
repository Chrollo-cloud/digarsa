# Testing Results and Known Issues

## Reported phase results

| Phase/check | Result | What it proves |
|---|---:|---|
| Backend Phase 5.9.6.5.3 Prisma validation | PASS | The report records `prisma validate` passing with the dedicated concurrency-test config; validation itself did not connect to the database. |
| Backend Phase 5.9.6.5.3 TypeScript no-emit check | PASS | The report records `npx.cmd tsc --noEmit` exiting successfully. |
| Backend Phase 5.9.6.5.3 focused unit tests | PASS, 33/33 | Dispute policy, booking timer/completion, revision policy, and admin assistance tests passed according to the report. |
| Backend isolated PostgreSQL/HTTP evidence | PASS in earlier reports | Phase 5.9.6.5.2 reported 8/8 PostgreSQL dispute tests, 4/4 focused HTTP checks, and 2/2 distinct-session race tests. Phase 5.9.6.5.3 reused that evidence; it did not rerun those database tests. |
| Frontend Phase 5.9.7 production build | PASS | Vite build completed; it emitted a main-chunk size advisory. |
| Frontend Phase 5.9.7 focused booking adapter tests | PASS, 5/5 | Mocked adapter checks passed. |
| Frontend Phase 5.9.7 changed-file lint | PASS | The report records focused ESLint on changed files passing. |
| Frontend Phase 5.9.8 production build | PASS | Build completed; main minified JavaScript chunk exceeded 500 kB. This is a warning, not a build failure. |
| Frontend Phase 5.9.8 focused booking adapter tests | PASS, 7/7 | Mocked tests covered status/optional mapping, cursor query, validation/create payload, errors, seller authenticated endpoints/decision, authorization failure, and cancellation multipart. |
| Frontend Phase 5.9.8 changed-file lint | PASS | ESLint passed for the two changed UI files and booking adapter test. |
| Frontend Phase 5.9.8 full suite | FAIL, 202/268 passed; 66 failed | Failures appeared across unrelated legacy/demo and other frontend areas. There is no pre-change full-suite baseline, so their origin is unknown. |
| Live frontend/backend HTTP integration | NOT VERIFIED | No authorized backend runtime was used in Phase 5.9.7/5.9.8. |
| Live production/shared database | NOT RUN | No production/shared database was accessed in these frontend phases. |

## Current frontend commands

Run from `D:\hackathon_plat\frontend_fix\frontend`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
node --test tests\booking-api.test.js
```

The focused adapter command uses mocked `fetch`; it is not live integration testing.

## Current backend test-script limitation

The backend `package.json` currently defines `test` as a placeholder that prints an error and exits nonzero. The successful backend unit command recorded in the Phase 5.9.6.5.3 report is:

```powershell
node --import tsx --test tests\dispute-policy.test.ts tests\booking-timer.test.ts tests\booking-completion-eligibility.test.ts tests\revision-policy.test.ts tests\revision-assistance.test.ts
```

Run it from `D:\hackathon_plat\backend` only after reviewing the current phase scope. The command above is historical evidence from the readiness report, not a handover rerun.

## Known issues

1. The 66 failures in the full frontend suite need an established baseline and investigation. Do not change unrelated tests solely to make the suite green.
2. No rendered customer/seller booking UI tests were run; the project does not currently use a component-render test harness for these screens.
3. Live role/ownership behavior and server error states remain unverified from the latest frontend integration phase.
4. No idempotency key exists for booking creation; the UI avoids automatic retry after an ambiguous network error.
5. The frontend bundle warning remains unresolved; the build still succeeds.
6. Backend `npm.cmd test` is not configured as a real test runner.

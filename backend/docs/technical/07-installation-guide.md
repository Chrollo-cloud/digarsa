# DIGARSA — Local Installation Guide

This guide records source-supported setup conventions. It does not include secrets and does not execute migrations or seeders. Verify the current package scripts before running them because project scripts can change.

## Prerequisites

- Node.js compatible with the repository; the audit environment reported Node.js v24.19.0, but the backend manifest does not pin that exact version.
- npm and network access to install declared packages.
- A PostgreSQL database configured for the intended environment and its required TLS CA.
- Separate backend and frontend terminals.

## Install dependencies

From the backend directory, install dependencies using the repository lockfile (`npm ci`). From `frontend_fix/frontend`, do the same for the frontend. Do not copy credentials into source files or commit environment files.

## Environment configuration

Configure values securely in the local process/environment according to the deployment owner. Required/recognized names found in source include:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Backend runtime PostgreSQL connection. |
| `DIRECT_URL` | Prisma CLI direct connection. |
| `JWT_SECRET` | JWT sign/verify secret. |
| `PORT`, `CORS_ORIGIN` | Backend listener and allowed frontend origin. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase Storage integration when used. |
| `SUPABASE_BUCKET_KTP`, `SUPABASE_BUCKET_CANCELLATION_EVIDENCE` | Private evidence bucket names. |
| `BOOKING_SCHEDULER_ENABLED` | Set process-locally to `false` for controlled testing that must not start booking jobs. |
| `VITE_API_BASE_URL` | Frontend API base URL; defaults to `http://localhost:3000`. |
| `OTP_MODE`, `PAYMENT_DEMO_MODE`, `VITE_ENABLE_DEMO_PAYMENT` | Mode controls for recovery/demo paths; use only as documented by the deployment owner. |

`NIK_ENCRYPTION_KEY` is associated with legacy identity-data helpers; its presence does not mean current seller activation requires identity documents. Never print environment values.

## Prisma and database

`prisma7.config.ts` loads dotenv and reads `DIRECT_URL`; backend runtime loads environment through the server entry and reads `DATABASE_URL`. Both TLS configurations reference the project CA with strict verification. Before any schema operation, confirm the intended database identity and follow the deployment's approved migration process. This guide intentionally does not prescribe a destructive reset or execute a migration. The schema and 16 migration directories are source artifacts, not proof that a given target is current.

## Run locally

Check `package.json` scripts in each workspace before execution. The backend's development script is reported as Prisma client generation followed by `tsx watch src/server.ts`; the frontend is Vite-based. For a controlled local backend run that must not initialize booking jobs, provide `BOOKING_SCHEDULER_ENABLED=false` only to that process. Set `VITE_API_BASE_URL` to the backend listener when it differs from the default. Do not make permanent production configuration changes for a local walkthrough.

## Basic checks

- Frontend test command: use the script declared in `frontend_fix/frontend/package.json` (Node test runner in the audited snapshot).
- Frontend lint/build: use the repository's declared scripts.
- Backend `npm test` currently is a placeholder that exits nonzero; focused historical tests used Node's test runner with `tsx` (see [Testing and Known Limitations](08-testing-and-known-limitations.md)).
- Do not infer database or live HTTP success from unit tests or a successful frontend build.

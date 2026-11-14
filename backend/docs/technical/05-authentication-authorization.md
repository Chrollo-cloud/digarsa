# DIGARSA — Authentication and Authorization

## Account registration and login

`POST /api/auth/register` and `POST /api/auth/login` are public, schema-validated endpoints. Password helpers in `src/lib/password.ts` use bcryptjs. Authentication responses use an access token and a mapped account response; password hashes are not returned through the user mapper.

## JWT validation and session restoration

The backend issues HS256 JWTs containing account identity/role and token-version information. `authenticate` restricts accepted algorithm, verifies the token, reloads current user state, and rejects disabled/stale sessions. `JWT_SECRET` is required by the auth configuration; do not place its value in documentation.

On the frontend, `AuthProvider` persists the access token through the auth-token helper and calls `GET /api/auth/me` when restoring a session. Protected routes use `RequireAccount`, `RequireSeller`, and `RequireAdmin` in `Guards.jsx`. Client guards improve navigation but do not replace backend authorization.

## Roles and seller capability

The database `Role` enum is `USER` or `ADMIN`. Seller access comes from an associated `SellerProfile`; operational routes may additionally require approved seller status. Profile preparation and service preparation routes do not all require approval, while availability and operational booking routes use stricter approval gates. Route-level policy is authoritative.

Public catalog visibility is independently gated by service active state, hidden flag, moderation approval, active category, and seller approval. Seller activation and service moderation are separate decisions.

## Ownership checks

Controllers/services scope account, seller, booking, conversation, report, review, and saved-item operations to the authenticated owner or participant. Some missing/foreign resources use 404 to avoid revealing existence; status codes differ by route and validation layer. Historical runtime authorization verification reported 27/27 passing checks; it was not rerun for this documentation phase.

## Logout behavior

Frontend logout clears local access-token/session state even when the network call fails. `POST /api/auth/logout-all` increments the user's token version, revoking all currently issued tokens for that account when the request succeeds. It is not single-device revocation. Runtime verification against a disposable account is not recorded.

## Invalid tokens and API failures

The shared frontend API client dispatches a session-invalid event for authenticated requests with a token when the backend returns 401; `AuthProvider` clears local session state. Focused authentication/API tests cover this behavior with mocks. A 403, network error, or 5xx response is not treated as a logout. Comprehensive browser-session behavior was not verified.

## Identity verification boundary

The schema retains legacy `SellerVerification` fields for identity data, but active identity endpoints are unavailable. The current seller activation review is non-identity and uses profile, portfolio, and service-offer snapshots. No current KTP/NIK requirement should be inferred from legacy schema fields.

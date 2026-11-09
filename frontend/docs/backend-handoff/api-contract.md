# Proposed REST API contract

**All endpoints below are Proposed, not existing.** Base `/api/v1`; identifiers are opaque strings, not trusted owner claims. This is a behavioral handoff, not executable OpenAPI or a server implementation. Confirm names and DTO mappings before coding.

## Rules applying to every endpoint

- HTTPS JSON. Request/response keys use [data-model mappings](data-model.md); preserve already-established messaging/review keys exactly. Dates/enums/visibility follow that document. Optional demo strings map deliberately to null; adapt to current form defaults.
- Auth `session` means a trusted server session; never a caller-supplied account ID, demo permission or localStorage session. `seller` additionally requires the session's unique owned Seller Profile. `admin` additionally requires explicit `admin:access`. Public reads still validate inputs and moderation visibility. Backend security is Proposed in [permissions.md](permissions.md).
- Success item envelope `{ "data": ... }`; no-data response `204` has **no JSON body**. List envelope `{ "data": [], "page": { "next_cursor": null, "has_more": false }, "total": 0 }`. `total` is the authorized filtered total, never global private counts. Examples are independent endpoint snapshots, not a sequential seeded dataset or records imported from a browser. A review example presupposes its booking has legitimately reached Completed; a Requested booking example never authorizes that review.
- All list endpoints use optional `cursor` (opaque, bound to actor/filter/sort), `limit` (default 20, max 100). Stable ordering adds ID tie-breaker. Count/summary/item/command endpoints have no pagination. Unknown filters/invalid enum/range/cursor → `422 VALIDATION_FAILED`. GET/DELETE have no request JSON; shown `null` means absent body, not send JSON null. Every endpoint's parameter line adds to these common rules; `none` means no additional query/path parameters.
- All endpoints can return `429 RATE_LIMITED` with Retry-After, `503 DEPENDENCY_UNAVAILABLE`/`DATA_INTEGRITY`, or `500 INTERNAL_ERROR` with a redacted request ID. Never return an authoritative empty list on failure. Session/seller/admin endpoints can additionally return `401 UNAUTHENTICATED` or `SESSION_EXPIRED`, and `403 FORBIDDEN` for a missing capability. Private record lookup returns uniform `404 NOT_FOUND_OR_FORBIDDEN` for missing/foreign IDs. Public missing/hidden detail returns `404 NOT_FOUND`. Specific errors below are additional, not an exhaustive replacement.
- Writes reject protected/unknown fields, derive owner/sender/recipient/IDs/timestamps/prices/status from trusted context, validate again within the transaction, and return only authorized DTOs. Anti-CSRF applies to cookie-authenticated mutations. Error details never contain credentials, private coordinates, other users' IDs or raw storage/DB dumps.
- Proposed concurrency: mutable resource GET/write responses carry ETag; updates/deletes/actions require If-Match, `428 PRECONDITION_REQUIRED` if absent, `412 STALE_VERSION` on stale revision. Keep revisions in HTTP metadata so exact messaging record contracts do not gain fields. Multi-resource list UI may need per-item revision metadata outside records or a detail fetch before mutation; agree adapter strategy. Current demo `expectedStatus` is mapped to `expected_status`, an additional state check, never authentication.
- Proposed idempotency: creation/command POST uses actor+operation scoped `Idempotency-Key`; replay same canonical payload returns original outcome, different payload `409 IDEMPOTENCY_CONFLICT`. Conversation context uniqueness and review booking uniqueness remain mandatory even without retry keys. Message `client_event_id` is the existing scoped retry contract; do not let a transport header override its mismatch checks. Idempotent PUT/DELETE must still authorize every retry. Key retention, failures/retry window and session-change behavior need agreement.
- Examples use invented opaque IDs and generic copy. Credential fields show input placeholders only; no credential or session values are examples. Coordinates are omitted/null; actual non-null point shape is defined by the model, never copied into URLs or logs.

### Error example

```json
{"error":{"code":"BOOKING_STATE_CONFLICT","message":"Status pesanan berubah. Muat ulang sebelum melanjutkan.","fields":{},"request_id":"request-example"}}
```

| HTTP | Stable proposed codes / meaning |
| --- | --- |
| 400 | MALFORMED_JSON; invalid request framing |
| 401 | UNAUTHENTICATED, SESSION_EXPIRED; clear actor-keyed client cache, preserve validated return route |
| 403 | FORBIDDEN, CSRF_REJECTED; session exists but lacks capability |
| 404 | NOT_FOUND_OR_FORBIDDEN for private IDs; NOT_FOUND for unavailable public resource |
| 409 | EMAIL_IN_USE, SELLER_ALREADY_ACTIVE, DUPLICATE_REVIEW, BOOKING_STATE_CONFLICT, SERVICE_NOT_BOOKABLE, ACTIVE_BOOKINGS, SCHEDULE_OVERLAP, IDEMPOTENCY_CONFLICT |
| 412 / 428 | STALE_VERSION / PRECONDITION_REQUIRED |
| 422 | VALIDATION_FAILED, INVALID_CONTEXT, SELF_BOOKING, SELF_MESSAGING, SELF_REVIEW, INELIGIBLE; fields map input names to localized errors |
| 429 | RATE_LIMITED, retry advice without credentials |
| 503 | DEPENDENCY_UNAVAILABLE, DATA_INTEGRITY; retry/recovery, no silent reset/fallback |
| 501 | CANCELLATION_NOT_IMPLEMENTED only if the deferred cancellation route is deliberately exposed |

Demo MessagingError/ReviewError codes and plain Error messages map into this envelope in the adapter; do not expose storage internals as production errors. Wrong login/current password uses generic validation/auth feedback without account enumeration. Password hashing/session records are never response fields.

## Endpoint catalogue

Each entry inherits the common auth/error/validation/pagination/concurrency rules above. Consumer paths are relative to `frontend/`; the exact linked inventory is in [architecture.md](architecture.md).


## Authentication and accounts

### E01 — `POST /api/v1/auth/register`

**Purpose:** Create unified buyer account and session.

**Authentication / authorization:** public; no caller role or permission accepted.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "name": "Nama Akun",
  "email": "account@example.invalid",
  "password": "<private user input>"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "user-example",
    "name": "Nama Akun",
    "email": "account@example.invalid",
    "avatar_url": null,
    "phone": null,
    "birth_date": null,
    "gender": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "seller_profile_id": null,
    "capabilities": [
      "buyer"
    ],
    "permissions": []
  }
}
```

**Validation / ownership:** Name 2–80, normalized email 3–254 valid/unique, password 8–128; reject roles, owner IDs and permissions. Return no credential material.

**Errors:** common errors above; 409 EMAIL_IN_USE.

**Pagination / ordering / concurrency:** 201; idempotency protects repeated registration; issue session cookie, no response token.

**Exact frontend consumer:** `src/features/account/demoStore.js register → AuthPage`. This is an adapter mapping, not an endpoint already called by the app.

### E02 — `POST /api/v1/auth/login`

**Purpose:** Authenticate and rotate session.

**Authentication / authorization:** public.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "email": "account@example.invalid",
  "password": "<private user input>"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "user-example",
    "name": "Nama Akun",
    "email": "account@example.invalid",
    "avatar_url": null,
    "phone": null,
    "birth_date": null,
    "gender": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "seller_profile_id": null,
    "capabilities": [
      "buyer"
    ],
    "permissions": []
  }
}
```

**Validation / ownership:** Normalize email; generic invalid-credential result; rate limit attempts. returnTo is client navigation only, never an authentication permission.

**Errors:** common errors above; 401 INVALID_CREDENTIALS.

**Pagination / ordering / concurrency:** 200; rotate session against fixation; do not cache/replay a login credential response.

**Exact frontend consumer:** `src/features/account/demoStore.js login → AuthPage`. This is an adapter mapping, not an endpoint already called by the app.

### E03 — `POST /api/v1/auth/logout`

**Purpose:** Revoke current session.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success response:** `204`, no body.

**Validation / ownership:** Revoke server session and expire cookie; do not delete account or profile.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 204; idempotent even if already expired; no If-Match.

**Exact frontend consumer:** `src/features/account/demoStore.js logout → LogoutButton, AccountMenu`. This is an adapter mapping, not an endpoint already called by the app.

### E04 — `GET /api/v1/me`

**Purpose:** Hydrate current user/session.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "user-example",
    "name": "Nama Akun",
    "email": "account@example.invalid",
    "avatar_url": null,
    "phone": null,
    "birth_date": null,
    "gender": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "seller_profile_id": null,
    "capabilities": [
      "buyer"
    ],
    "permissions": []
  }
}
```

**Validation / ownership:** Only safe current-account projection; buyer capability always present, seller derived, permissions explicit.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; private no-store, no pagination.

**Exact frontend consumer:** `src/features/account/demoStore.js current → AuthProvider`. This is an adapter mapping, not an endpoint already called by the app.

### E05 — `PATCH /api/v1/me/profile`

**Purpose:** Edit supported personal fields.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "name": "Nama Baru",
  "avatar_url": null,
  "phone": null,
  "birth_date": null,
  "gender": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "user-example",
    "name": "Nama Baru",
    "email": "account@example.invalid",
    "avatar_url": null,
    "phone": null,
    "birth_date": null,
    "gender": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "seller_profile_id": null,
    "capabilities": [
      "buyer"
    ],
    "permissions": []
  }
}
```

**Validation / ownership:** Name 2–80; optional HTTP(S) URL ≤2048 no embedded credentials; phone 7–15 digits after stripping formatting ≤25 chars; real birth date not future; gender null or existing enum. No email/ID/permission/association patches.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match; preserve stable IDs and Seller Profile association.

**Exact frontend consumer:** `src/features/account/demoStore.js updateProfile → PersonalInfoForm`. This is an adapter mapping, not an endpoint already called by the app.

### E06 — `POST /api/v1/me/password`

**Purpose:** Change password with current verification.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "current_password": "<private user input>",
  "new_password": "<private user input>",
  "confirmation": "<private user input>"
}
```

**Success JSON example:**

```json
{
  "data": {
    "changed": true
  }
}
```

**Validation / ownership:** Verify current password; new 8–128, matches confirmation, differs from current; reject changed/expired actor before commit. No password echo.

**Errors:** common errors above; 422 CURRENT_PASSWORD_INVALID.

**Pagination / ordering / concurrency:** 200; CSRF + reauthentication; proposed other-session revocation policy needs agreement; current demo preserves session. No generic replay of credential bodies.

**Exact frontend consumer:** `src/features/account/demoStore.js changePassword → PasswordChangeForm`. This is an adapter mapping, not an endpoint already called by the app.


## Seller Profile

### E07 — `POST /api/v1/me/seller-profile`

**Purpose:** Activate one Seller Profile while retaining buyer access.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "name": "Studio Contoh",
  "category": "Branding",
  "city": "Makassar",
  "bio": "Studio kreatif untuk identitas visual bisnis lokal.",
  "image_url": null,
  "portfolio_link": null,
  "specialties": [
    "Identitas visual"
  ],
  "public_location": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "creator-example",
    "owner_user_id": "owner-example",
    "name": "Studio Contoh",
    "category": "Branding",
    "city": "Makassar",
    "bio": "Studio kreatif untuk identitas visual bisnis lokal.",
    "image_url": null,
    "portfolio_link": null,
    "specialties": [
      "Identitas visual"
    ],
    "public_location": null
  }
}
```

**Validation / ownership:** Name/city 2–80, bio 30–500, exact category, optional URLs ≤2048 HTTP(S) no credentials; specialties array adapter from comma text ≤500; validate public location. Owner is session, unique per account.

**Errors:** common errors above; 409 SELLER_ALREADY_ACTIVE.

**Pagination / ordering / concurrency:** 201; transactional unique owner constraint plus idempotency, never client-chosen profile ID.

**Exact frontend consumer:** `src/features/account/demoStore.js activateSeller → OnboardingPage`. This is an adapter mapping, not an endpoint already called by the app.

### E08 — `GET /api/v1/me/seller-profile`

**Purpose:** Read owned profile.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "creator-example",
    "owner_user_id": "owner-example",
    "name": "Studio Contoh",
    "category": "Branding",
    "city": "Makassar",
    "bio": "Studio kreatif untuk identitas visual bisnis lokal.",
    "image_url": null,
    "portfolio_link": null,
    "specialties": [
      "Identitas visual"
    ],
    "public_location": null
  }
}
```

**Validation / ownership:** Resolve unique profile by current account; no arbitrary owner query.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; ETag.

**Exact frontend consumer:** `src/features/account/demoStore.js getOwnedSeller → SellerProfilePage`. This is an adapter mapping, not an endpoint already called by the app.

### E09 — `PUT /api/v1/me/seller-profile`

**Purpose:** Update full supported seller identity.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "name": "Studio Contoh",
  "category": "Branding",
  "city": "Makassar",
  "bio": "Studio kreatif untuk identitas visual bisnis lokal.",
  "image_url": null,
  "portfolio_link": null,
  "specialties": [
    "Identitas visual"
  ],
  "public_location": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "creator-example",
    "owner_user_id": "owner-example",
    "name": "Studio Contoh",
    "category": "Branding",
    "city": "Makassar",
    "bio": "Studio kreatif untuk identitas visual bisnis lokal.",
    "image_url": null,
    "portfolio_link": null,
    "specialties": [
      "Identitas visual"
    ],
    "public_location": null
  }
}
```

**Validation / ownership:** Same seller input validation as activation; IDs/owner immutable. Preserve omitted optional location according to explicit adapter policy; dedicated location endpoint below removes ambiguity. Seller phone still uses /me/profile.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match, atomically refresh public projection without altering historical snapshots.

**Exact frontend consumer:** `src/features/account/demoStore.js updateSellerProfile → SellerProfilePage`. This is an adapter mapping, not an endpoint already called by the app.


## Seller services and planning

### E10 — `GET /api/v1/seller/services`

**Purpose:** List own services including archived/hidden.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** active?,availability?,category?. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "service-example",
      "seller_profile_id": "creator-example",
      "title": "Identitas visual bisnis lokal",
      "category": "Branding",
      "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
      "price": 1200000,
      "delivery": "Remote",
      "turnaround": "7 hari kerja",
      "availability": "Open",
      "image_url": null,
      "active": true,
      "service_location": null,
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": "2026-11-09T00:00:00.000Z"
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Owner scoped; include moderation reason for owner, not arbitrary account contact. Sort created_at desc,id.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list pagination/filter validation.

**Exact frontend consumer:** `src/features/seller/sellerStore.js mine → SellerServicesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E11 — `POST /api/v1/seller/services`

**Purpose:** Create seller-owned service.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "title": "Identitas visual bisnis lokal",
  "category": "Branding",
  "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
  "price": 1200000,
  "delivery": "Remote",
  "turnaround": "7 hari kerja",
  "availability": "Open",
  "image_url": null,
  "service_location": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "service-example",
    "seller_profile_id": "creator-example",
    "title": "Identitas visual bisnis lokal",
    "category": "Branding",
    "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
    "price": 1200000,
    "delivery": "Remote",
    "turnaround": "7 hari kerja",
    "availability": "Open",
    "image_url": null,
    "active": true,
    "service_location": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Title 5–100, description 30–1500, integer IDR 10000–100000000, category/delivery/availability enums, turnaround 2–60, optional safe image URL ≤2048. Valid location; owner/profile from session.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 201; idempotency and collision-safe ID, default active=true as current UI.

**Exact frontend consumer:** `src/features/seller/sellerStore.js create → ServiceFormPage`. This is an adapter mapping, not an endpoint already called by the app.

### E12 — `GET /api/v1/seller/services/{service_id}`

**Purpose:** Read own editable service.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "service-example",
    "seller_profile_id": "creator-example",
    "title": "Identitas visual bisnis lokal",
    "category": "Branding",
    "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
    "price": 1200000,
    "delivery": "Remote",
    "turnaround": "7 hari kerja",
    "availability": "Open",
    "image_url": null,
    "active": true,
    "service_location": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Must match current profile through service FK even if inactive/hidden.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; ETag, not an existing separate demo method.

**Exact frontend consumer:** `src/features/seller/sellerStore.js mine (selected record) → ServiceFormPage`. This is an adapter mapping, not an endpoint already called by the app.

### E13 — `PUT /api/v1/seller/services/{service_id}`

**Purpose:** Edit full service fields.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "title": "Identitas visual bisnis lokal",
  "category": "Branding",
  "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
  "price": 1200000,
  "delivery": "Remote",
  "turnaround": "7 hari kerja",
  "availability": "Open",
  "image_url": null,
  "service_location": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "service-example",
    "seller_profile_id": "creator-example",
    "title": "Identitas visual bisnis lokal",
    "category": "Branding",
    "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
    "price": 1200000,
    "delivery": "Remote",
    "turnaround": "7 hari kerja",
    "availability": "Open",
    "image_url": null,
    "active": true,
    "service_location": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Same new-service validation; owner/IDs/creation timestamp immutable; do not mutate booking snapshots. Optional omitted location must preserve old value as demo does.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match; no moderation override.

**Exact frontend consumer:** `src/features/seller/sellerStore.js update → ServiceFormPage`. This is an adapter mapping, not an endpoint already called by the app.

### E14 — `PUT /api/v1/seller/services/{service_id}/availability`

**Purpose:** Set Open/Full-book.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "availability": "Full-book"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "service-example",
    "seller_profile_id": "creator-example",
    "title": "Identitas visual bisnis lokal",
    "category": "Branding",
    "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
    "price": 1200000,
    "delivery": "Remote",
    "turnaround": "7 hari kerja",
    "availability": "Full-book",
    "image_url": null,
    "active": true,
    "service_location": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Exact enum; no implicit archive or booking state mutation.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match; retries remain owner checked.

**Exact frontend consumer:** `src/features/seller/sellerStore.js setAvailability → SellerServicesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E15 — `PUT /api/v1/seller/services/{service_id}/publication`

**Purpose:** Archive/unarchive own service.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "active": false
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "service-example",
    "seller_profile_id": "creator-example",
    "title": "Identitas visual bisnis lokal",
    "category": "Branding",
    "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
    "price": 1200000,
    "delivery": "Remote",
    "turnaround": "7 hari kerja",
    "availability": "Open",
    "image_url": null,
    "active": false,
    "service_location": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Boolean only; public visibility also requires not moderated; reactivation cannot override moderation. Historical bookings remain.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match. Does not claim active bookings are cancelled.

**Exact frontend consumer:** `src/features/seller/sellerStore.js setActive → SellerServicesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E16 — `DELETE /api/v1/seller/services/{service_id}`

**Purpose:** Remove service safely.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success response:** `204`, no body.

**Validation / ownership:** Lock service and verify all bookings/ownership; Requested/Accepted/Paid block deletion. Any integrity/read failure blocks. Backend tombstone preferred to demo physical removal; retain historical associations.

**Errors:** common errors above; 409 ACTIVE_BOOKINGS; 503 DATA_INTEGRITY.

**Pagination / ordering / concurrency:** 204; If-Match; deletion vs concurrent booking must serialize; delete planning data only per agreed retention.

**Exact frontend consumer:** `src/features/seller/sellerStore.js remove; customerStore.getActiveBookingCount → SellerServicesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E17 — `GET /api/v1/seller/services/{service_id}/schedules`

**Purpose:** Read planning slots.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id; date_from?,date_to?. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "availability-example",
      "service_id": "service-example",
      "date": "2026-12-01",
      "start_time": "09:00",
      "end_time": "12:00",
      "note": "Diskusi proyek",
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": "2026-11-09T00:00:00.000Z"
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Owned service; valid date interval, date/start_time asc,id. Not promised public availability inventory.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/seller/sellerStore.js schedulesFor → SellerAvailabilityPage`. This is an adapter mapping, not an endpoint already called by the app.

### E18 — `POST /api/v1/seller/services/{service_id}/schedules`

**Purpose:** Create/update owned planning interval.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "date": "2026-12-01",
  "start_time": "09:00",
  "end_time": "12:00",
  "note": "Diskusi proyek"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "availability-example",
    "service_id": "service-example",
    "date": "2026-12-01",
    "start_time": "09:00",
    "end_time": "12:00",
    "note": "Diskusi proyek",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Canonical date today/future, HH:mm start<end, note ≤160, reject same-service/date overlaps; adjacent permitted. Schedule ID must belong to parent service. Booking does not reserve these slots.

**Errors:** common errors above; 409 SCHEDULE_OVERLAP.

**Pagination / ordering / concurrency:** 201; idempotency; serialize overlap validation. Timezone needs agreement.

**Exact frontend consumer:** `src/features/seller/sellerStore.js createSchedule → SellerAvailabilityPage`. This is an adapter mapping, not an endpoint already called by the app.

### E19 — `PUT /api/v1/seller/services/{service_id}/schedules/{schedule_id}`

**Purpose:** Create/update owned planning interval.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id, schedule_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "date": "2026-12-01",
  "start_time": "09:00",
  "end_time": "12:00",
  "note": "Diskusi proyek"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "availability-example",
    "service_id": "service-example",
    "date": "2026-12-01",
    "start_time": "09:00",
    "end_time": "12:00",
    "note": "Diskusi proyek",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Canonical date today/future, HH:mm start<end, note ≤160, reject same-service/date overlaps; adjacent permitted. Schedule ID must belong to parent service. Booking does not reserve these slots.

**Errors:** common errors above; 409 SCHEDULE_OVERLAP.

**Pagination / ordering / concurrency:** 200; If-Match; serialize overlap validation. Timezone needs agreement.

**Exact frontend consumer:** `src/features/seller/sellerStore.js updateSchedule → SellerAvailabilityPage`. This is an adapter mapping, not an endpoint already called by the app.

### E20 — `DELETE /api/v1/seller/services/{service_id}/schedules/{schedule_id}`

**Purpose:** Remove owned planning interval.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id,schedule_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success response:** `204`, no body.

**Validation / ownership:** Authorize both parent and slot; do not update bookings.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 204; If-Match.

**Exact frontend consumer:** `src/features/seller/sellerStore.js removeSchedule → SellerAvailabilityPage`. This is an adapter mapping, not an endpoint already called by the app.


## Public marketplace

### E21 — `GET /api/v1/services`

**Purpose:** Discover visible catalog.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** q?,category?,city?,min?,max?,availability?,sort=editor|price-up|price-down|rating. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "service-example",
      "seller_profile_id": "creator-example",
      "title": "Identitas visual bisnis lokal",
      "category": "Branding",
      "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
      "price": 1200000,
      "delivery": "Remote",
      "turnaround": "7 hari kerja",
      "availability": "Open",
      "image_url": null,
      "active": true,
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": "2026-11-09T00:00:00.000Z",
      "studio": "Studio Contoh",
      "public_location": null,
      "bookable": true,
      "source": "seller",
      "alt": "Contoh pekerjaan identitas visual",
      "images": []
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Match title/description/category/creator/city/skills; exact category/city/availability, finite nonnegative prices min≤max. Verified ratings only. Exclude archived/hidden. bookable/source are proposed explicit display eligibility fields; preserve editorial display as nonbookable.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; stable sort+cursor; visible catalog failure must be an error, not baseline fallback.

**Exact frontend consumer:** `src/data/marketplace.js services/categories/locations; MarketplacePage; ServiceCard`. This is an adapter mapping, not an endpoint already called by the app.

### E22 — `GET /api/v1/services/{service_id}`

**Purpose:** Read public detail/gallery.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "service-example",
    "seller_profile_id": "creator-example",
    "title": "Identitas visual bisnis lokal",
    "category": "Branding",
    "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
    "price": 1200000,
    "delivery": "Remote",
    "turnaround": "7 hari kerja",
    "availability": "Open",
    "image_url": null,
    "active": true,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z",
    "studio": "Studio Contoh",
    "public_location": null,
    "bookable": true,
    "source": "seller",
    "alt": "Contoh pekerjaan identitas visual",
    "images": []
  }
}
```

**Validation / ownership:** Hidden/inactive/missing →404; Full-book may render with booking disabled; editorial nonbookable clearly labeled. Gallery image/alt fallbacks remain UI data.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/data/marketplace.js services → ServiceDetailPage`. This is an adapter mapping, not an endpoint already called by the app.

### E23 — `GET /api/v1/creators/{seller_profile_id}`

**Purpose:** Public creator identity.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** path seller_profile_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "creator-example",
    "name": "Studio Contoh",
    "category": "Branding",
    "city": "Makassar",
    "bio": "Studio kreatif untuk identitas visual bisnis lokal.",
    "image_url": null,
    "portfolio_link": null,
    "specialties": [
      "Identitas visual"
    ],
    "public_location": null,
    "services": [
      {
        "id": "service-example",
        "seller_profile_id": "creator-example",
        "title": "Identitas visual bisnis lokal",
        "category": "Branding",
        "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
        "price": 1200000,
        "delivery": "Remote",
        "turnaround": "7 hari kerja",
        "availability": "Open",
        "image_url": null,
        "active": true,
        "created_at": "2026-11-09T00:00:00.000Z",
        "updated_at": "2026-11-09T00:00:00.000Z",
        "studio": "Studio Contoh",
        "public_location": null,
        "bookable": true,
        "source": "seller",
        "alt": "Contoh pekerjaan identitas visual",
        "images": []
      }
    ],
    "portfolio": []
  }
}
```

**Validation / ownership:** Return intentionally public bio/city/skills/portfolio and visible listings; no account email/phone/private location. Editorial display profiles require explicit nontransactional source, no fake owner.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/data/marketplace.js getCreator/creators → CreatorProfilePage`. This is an adapter mapping, not an endpoint already called by the app.

### E24 — `GET /api/v1/catalog/facets`

**Purpose:** Discover reliable categories/cities.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "categories": [
      "Branding"
    ],
    "cities": [
      "Makassar"
    ]
  }
}
```

**Validation / ownership:** From same healthy visible catalog revision; exact existing enum values, no private buyer locations.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/data/marketplace.js categories/locations → Filters, MarketplacePage`. This is an adapter mapping, not an endpoint already called by the app.


## Customer saved services

### E25 — `GET /api/v1/me/favorites`

**Purpose:** Read current account saved list.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "service_id": "service-example",
      "service": {
        "id": "service-example",
        "seller_profile_id": "creator-example",
        "title": "Identitas visual bisnis lokal",
        "category": "Branding",
        "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
        "price": 1200000,
        "delivery": "Remote",
        "turnaround": "7 hari kerja",
        "availability": "Open",
        "image_url": null,
        "active": true,
        "created_at": "2026-11-09T00:00:00.000Z",
        "updated_at": "2026-11-09T00:00:00.000Z",
        "studio": "Studio Contoh",
        "public_location": null,
        "bookable": true,
        "source": "seller",
        "alt": "Contoh pekerjaan identitas visual",
        "images": []
      },
      "available": true
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Only current owner. Missing/unpublished entries remain removable; do not silently reset list. No quantity, checkout or aggregate payable amount.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/customer/customerStore.js view → FavoritesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E26 — `PUT /api/v1/me/favorites/{service_id}`

**Purpose:** Add saved service idempotently.

**Authentication / authorization:** session; current account only.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{}
```

**Success JSON example:**

```json
{
  "data": {
    "service_id": "service-example"
  }
}
```

**Validation / ownership:** Known catalog entry; Full-book/orphan may be saved but cannot bypass separate booking proof. Editorial saved-content key decision pending.

**Errors:** common errors above; 404 NOT_FOUND.

**Pagination / ordering / concurrency:** 200; unique owner+service relation, no duplicate list entries; no If-Match required for this idempotent set insertion.

**Exact frontend consumer:** `src/features/customer/customerStore.js addFavorite → ServiceActions, FavoritesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E27 — `DELETE /api/v1/me/favorites/{service_id}`

**Purpose:** Remove saved entry.

**Authentication / authorization:** session; current account only.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success response:** `204`, no body.

**Validation / ownership:** Removal must work for stale/unknown catalog IDs already saved by current owner.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 204; idempotent owner-scoped deletion; no global list reset; no If-Match required for this set removal.

**Exact frontend consumer:** `src/features/customer/customerStore.js removeFavorite → FavoritesPage`. This is an adapter mapping, not an endpoint already called by the app.

### E28 — `GET /api/v1/me/cart`

**Purpose:** Read current account saved list.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "service_id": "service-example",
      "service": {
        "id": "service-example",
        "seller_profile_id": "creator-example",
        "title": "Identitas visual bisnis lokal",
        "category": "Branding",
        "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
        "price": 1200000,
        "delivery": "Remote",
        "turnaround": "7 hari kerja",
        "availability": "Open",
        "image_url": null,
        "active": true,
        "created_at": "2026-11-09T00:00:00.000Z",
        "updated_at": "2026-11-09T00:00:00.000Z",
        "studio": "Studio Contoh",
        "public_location": null,
        "bookable": true,
        "source": "seller",
        "alt": "Contoh pekerjaan identitas visual",
        "images": []
      },
      "available": true
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Only current owner. Missing/unpublished entries remain removable; do not silently reset list. No quantity, checkout or aggregate payable amount.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/customer/customerStore.js view → CartPage`. This is an adapter mapping, not an endpoint already called by the app.

### E29 — `PUT /api/v1/me/cart/{service_id}`

**Purpose:** Add saved service idempotently.

**Authentication / authorization:** session; current account only.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{}
```

**Success JSON example:**

```json
{
  "data": {
    "service_id": "service-example"
  }
}
```

**Validation / ownership:** Known catalog entry; Full-book/orphan may be saved but cannot bypass separate booking proof. Editorial saved-content key decision pending.

**Errors:** common errors above; 404 NOT_FOUND.

**Pagination / ordering / concurrency:** 200; unique owner+service relation, no duplicate list entries; no If-Match required for this idempotent set insertion.

**Exact frontend consumer:** `src/features/customer/customerStore.js addToCart → ServiceActions, CartPage`. This is an adapter mapping, not an endpoint already called by the app.

### E30 — `DELETE /api/v1/me/cart/{service_id}`

**Purpose:** Remove saved entry.

**Authentication / authorization:** session; current account only.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success response:** `204`, no body.

**Validation / ownership:** Removal must work for stale/unknown catalog IDs already saved by current owner.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 204; idempotent owner-scoped deletion; no global list reset; no If-Match required for this set removal.

**Exact frontend consumer:** `src/features/customer/customerStore.js removeFromCart → CartPage`. This is an adapter mapping, not an endpoint already called by the app.


## Bookings

### E31 — `POST /api/v1/services/{service_id}/booking-validation`

**Purpose:** Validate draft and compute trusted estimate.

**Authentication / authorization:** session; current account only.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "requirements": "Identitas visual untuk usaha lokal.",
  "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
  "requested_date": null,
  "location": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "valid": true,
    "service_id": "service-example",
    "estimated_price": 1200000,
    "delivery_mode": "remote"
  }
}
```

**Validation / ownership:** Same eligibility and brief checks as creation; this is advisory, not a price/availability lock. No booking write.

**Errors:** common errors above; 409 SERVICE_NOT_BOOKABLE; 422 SELF_BOOKING.

**Pagination / ordering / concurrency:** 200; no idempotency/If-Match required; definitive revalidation at creation.

**Exact frontend consumer:** `src/features/customer/customerStore.js getBookingRestriction/validateBooking → BookingRequestPage, ServiceActions`. This is an adapter mapping, not an endpoint already called by the app.

### E32 — `POST /api/v1/bookings`

**Purpose:** Submit reviewed booking request.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "service_id": "service-example",
  "requirements": "Identitas visual untuk usaha lokal.",
  "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
  "requested_date": null,
  "location": null,
  "confirmed": true
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "booking-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "estimated_price": 1200000,
    "delivery_mode": "remote",
    "requested_date": null,
    "location": null,
    "requirements": "Identitas visual untuk usaha lokal.",
    "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
    "status": "Requested",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": null,
    "decline_reason": null
  }
}
```

**Validation / ownership:** confirmed=true; real eligible seller owner, no self-booking, healthy visible Open service, supported delivery/price; requirements10–2000, description20–5000. Onsite date today/future+location10–500; remote location discarded, date optional unless listing truly requiresSchedule. Derive all snapshots and Requested status.

**Errors:** common errors above; 409 SERVICE_NOT_BOOKABLE; 422 SELF_BOOKING, INVALID_CONTEXT.

**Pagination / ordering / concurrency:** 201; Idempotency-Key; transaction booking+own cart removal+requested outbox event; service lock against deletion/moderation.

**Exact frontend consumer:** `src/features/customer/customerStore.js createBooking → BookingRequestPage`. This is an adapter mapping, not an endpoint already called by the app.

### E33 — `GET /api/v1/me/bookings`

**Purpose:** Read customer orders/dashboard.

**Authentication / authorization:** session; booking.customer_user_id equals current account.

**Parameters:** status? exact enum. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "booking-example",
      "customer_user_id": "user-example",
      "seller_profile_id": "creator-example",
      "service_id": "service-example",
      "service_title": "Identitas visual bisnis lokal",
      "seller_name": "Studio Contoh",
      "estimated_price": 1200000,
      "delivery_mode": "remote",
      "requested_date": null,
      "location": null,
      "requirements": "Identitas visual untuk usaha lokal.",
      "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
      "status": "Requested",
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": null,
      "decline_reason": null
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Scope to actor before filtering/counting; created_at desc,id; private brief visible only under ownership policy.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/customer/customerStore.js view → OrdersPage, DashboardPage`. This is an adapter mapping, not an endpoint already called by the app.

### E34 — `GET /api/v1/me/bookings/{booking_id}`

**Purpose:** Read owned booking and tracking.

**Authentication / authorization:** session; booking.customer_user_id equals current account.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "booking-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "estimated_price": 1200000,
    "delivery_mode": "remote",
    "requested_date": null,
    "location": null,
    "requirements": "Identitas visual untuk usaha lokal.",
    "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
    "status": "Requested",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": null,
    "decline_reason": null
  }
}
```

**Validation / ownership:** No existence leak; show saved decline reason only for owned Declined context, missing reason gracefully.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/customer/customerStore.js getBooking → BookingDetailPage`. This is an adapter mapping, not an endpoint already called by the app.

### E35 — `GET /api/v1/seller/bookings`

**Purpose:** Read own incoming orders.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** status? exact enum. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "booking-example",
      "customer_user_id": "user-example",
      "seller_profile_id": "creator-example",
      "service_id": "service-example",
      "service_title": "Identitas visual bisnis lokal",
      "seller_name": "Studio Contoh",
      "estimated_price": 1200000,
      "delivery_mode": "remote",
      "requested_date": null,
      "location": null,
      "requirements": "Identitas visual untuk usaha lokal.",
      "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
      "status": "Requested",
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": null,
      "decline_reason": null
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** booking seller_profile_id must equal session owned profile; minimal customer display identity from associated records, not unrestricted user lookup.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/customer/customerStore.js sellerView; demoStore.customerNames → SellerOrdersPage, useSeller`. This is an adapter mapping, not an endpoint already called by the app.

### E36 — `GET /api/v1/seller/bookings/{booking_id}`

**Purpose:** Read owned incoming order.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "booking-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "estimated_price": 1200000,
    "delivery_mode": "remote",
    "requested_date": null,
    "location": null,
    "requirements": "Identitas visual untuk usaha lokal.",
    "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
    "status": "Requested",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": null,
    "decline_reason": null
  }
}
```

**Validation / ownership:** Match owning profile, never accept caller-provided creator ID as authorization.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; ETag.

**Exact frontend consumer:** `src/features/customer/customerStore.js sellerView (selected) → SellerOrderDetailPage`. This is an adapter mapping, not an endpoint already called by the app.

### E37 — `POST /api/v1/seller/bookings/{booking_id}/accept`

**Purpose:** Apply accept transition.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "expected_status": "Requested"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "booking-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "estimated_price": 1200000,
    "delivery_mode": "remote",
    "requested_date": null,
    "location": null,
    "requirements": "Identitas visual untuk usaha lokal.",
    "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
    "status": "Accepted",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T01:00:00.000Z",
    "decline_reason": null
  }
}
```

**Validation / ownership:** Lock booking, owned profile, exact current/expected status. Decline reason optional trimmed≤500. Complete only from legitimate Paid, never Accepted; no client price/payment flags.

**Errors:** common errors above; 409 BOOKING_STATE_CONFLICT.

**Pagination / ordering / concurrency:** 200; If-Match + idempotency; update status/timestamp and one event in same transaction.

**Exact frontend consumer:** `src/features/customer/customerStore.js respondToBooking(id,"accept",options) → SellerOrderDetailPage`. This is an adapter mapping, not an endpoint already called by the app.

### E38 — `POST /api/v1/seller/bookings/{booking_id}/decline`

**Purpose:** Apply decline transition.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "expected_status": "Requested",
  "reason": "Jadwal kreator belum tersedia untuk proyek ini."
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "booking-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "estimated_price": 1200000,
    "delivery_mode": "remote",
    "requested_date": null,
    "location": null,
    "requirements": "Identitas visual untuk usaha lokal.",
    "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
    "status": "Declined",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T01:00:00.000Z",
    "decline_reason": "Jadwal kreator belum tersedia untuk proyek ini."
  }
}
```

**Validation / ownership:** Lock booking, owned profile, exact current/expected status. Decline reason optional trimmed≤500. Complete only from legitimate Paid, never Accepted; no client price/payment flags.

**Errors:** common errors above; 409 BOOKING_STATE_CONFLICT.

**Pagination / ordering / concurrency:** 200; If-Match + idempotency; update status/timestamp and one event in same transaction.

**Exact frontend consumer:** `src/features/customer/customerStore.js respondToBooking(id,"decline",options) → SellerOrderDetailPage`. This is an adapter mapping, not an endpoint already called by the app.

### E39 — `POST /api/v1/seller/bookings/{booking_id}/complete`

**Purpose:** Apply complete transition.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "expected_status": "Paid"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "booking-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "estimated_price": 1200000,
    "delivery_mode": "remote",
    "requested_date": null,
    "location": null,
    "requirements": "Identitas visual untuk usaha lokal.",
    "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
    "status": "Completed",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T01:00:00.000Z",
    "decline_reason": null
  }
}
```

**Validation / ownership:** Lock booking, owned profile, exact current/expected status. Decline reason optional trimmed≤500. Complete only from legitimate Paid, never Accepted; no client price/payment flags.

**Errors:** common errors above; 409 BOOKING_STATE_CONFLICT.

**Pagination / ordering / concurrency:** 200; If-Match + idempotency; update status/timestamp and one event in same transaction.

**Exact frontend consumer:** `src/features/customer/customerStore.js respondToBooking(id,"complete",options) → SellerOrderDetailPage`. This is an adapter mapping, not an endpoint already called by the app.

### E40 — `POST /api/v1/me/bookings/{booking_id}/cancel`

**Purpose:** DEFERRED: proposed cancellation capability; not currently implemented.

**Authentication / authorization:** session; booking.customer_user_id equals current account.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "reason": "Permintaan pembatalan pelanggan."
}
```

**Response example:**

```json
{
  "error": {
    "code": "CANCELLATION_NOT_IMPLEMENTED",
    "message": "Kebijakan pembatalan belum tersedia."
  }
}
```

**Validation / ownership:** No current mutation consumer. Allowed source states, seller/system authority, refunds, reason limits and notification type need team approval. Do not implement an unrestricted Cancelled setter or infer refund/payment behavior.

**Errors:** common errors above; 501 if exposed; otherwise no route.

**Pagination / ordering / concurrency:** Not ready to implement. No current success DTO; after policy approval would return an authorized Booking using idempotency+state/version checks. Intentionally not a claimed working endpoint.

**Exact frontend consumer:** `NONE: customerStore has readable Cancelled only; future BookingDetailPage integration`. This is an adapter mapping, not an endpoint already called by the app.


## Seller analytics

### E41 — `GET /api/v1/seller/analytics`

**Purpose:** Read owned dashboard KPI/trend estimates.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** period=week|month|year; timezone? validated IANA name. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "requested_count": 0,
    "active_services": 1,
    "accepted_count": 0,
    "completed_count": 0,
    "total_bookings": 0,
    "estimated_completed": 0,
    "trend": {
      "period": "week",
      "buckets": [],
      "total": 0
    }
  }
}
```

**Validation / ownership:** Count real owned records. 7/30 local calendar days or12 months by created_at, exclude invalid/future/outside dates; empty honest. Specify resolved timezone/window in final DTO; no fake revenue/presence. Example omits generated zero buckets for brevity.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; summary no pagination; replace pure helpers only after matching exact denominators/window.

**Exact frontend consumer:** `src/features/seller/sellerAnalytics.js summarizeSellerDashboard/aggregateBookingTrend → SellerOverviewPage`. This is an adapter mapping, not an endpoint already called by the app.

### E42 — `GET /api/v1/seller/earnings`

**Purpose:** Read estimates, not payment ledger.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "completed_count": 0,
    "estimated_completed": 0,
    "in_progress_count": 0,
    "pending_count": 0,
    "declined_count": 0,
    "months": []
  }
}
```

**Validation / ownership:** Completed estimate=sum immutable estimated_price; in-progress Accepted+Paid; pending Requested; declined group Declined+Cancelled; month updated_at||created_at. No received balance, transactions, settlement or payout.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; summary unpaginated; performance denominator definitions in architecture.

**Exact frontend consumer:** `src/features/seller/earnings.js summarizeEarnings/summarizePerformance → EarningsPage`. This is an adapter mapping, not an endpoint already called by the app.


## Conversations and messages

### E43 — `POST /api/v1/conversations`

**Purpose:** Get or create canonical context.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "seller_profile_id": "creator-example",
  "service_id": "service-example",
  "booking_id": null
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "conversation-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "booking_id": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z",
    "last_message_at": null
  }
}
```

**Validation / ownership:** Customer is session by default. For booking-only request derive all participants/service from authorized booking. Seller may initiate only through verified owned booking, not arbitrary customer ID. Match service/seller and disallow self-contact. Historical booking may retain removed service context.

**Errors:** common errors above; 422 INVALID_CONTEXT, SELF_MESSAGING.

**Pagination / ordering / concurrency:** 200 existing or201 created; null-safe unique context and transaction, Idempotency-Key optional. Shared low-level customer_user_id field is not permission; production adapter can omit for buyer requests.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js getOrCreateConversation; customerMessaging.startService/startBooking`. This is an adapter mapping, not an endpoint already called by the app.

### E44 — `GET /api/v1/conversations`

**Purpose:** Read role-specific inbox.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** view=customer|seller required; q? creator/customer/service/preview. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "conversation": {
        "id": "conversation-example",
        "customer_user_id": "user-example",
        "seller_profile_id": "creator-example",
        "service_id": "service-example",
        "booking_id": null,
        "created_at": "2026-11-09T00:00:00.000Z",
        "updated_at": "2026-11-09T00:00:00.000Z",
        "last_message_at": null
      },
      "last_message": null,
      "unread_count": 0,
      "counterpart_name": "Studio Contoh",
      "service_title": "Identitas visual bisnis lokal"
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** customer view requires customer_user_id=session; seller view requires current owned profile. Minimal counterpart avatar/name only; current facades decorate records without storing extra fields. updated_at desc,id.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js listConversations; customerMessaging.listInbox; sellerMessaging.listInbox`. This is an adapter mapping, not an endpoint already called by the app.

### E45 — `GET /api/v1/conversations/{conversation_id}`

**Purpose:** Read authorized conversation.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** path conversation_id; view=customer|seller. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "id": "conversation-example",
    "customer_user_id": "user-example",
    "seller_profile_id": "creator-example",
    "service_id": "service-example",
    "booking_id": null,
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T00:00:00.000Z",
    "last_message_at": null
  }
}
```

**Validation / ownership:** Authorize store participant and requested role; other user or wrong-role route gets uniform404. Admin has no private chat bypass.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js getConversation; customer/seller getThread`. This is an adapter mapping, not an endpoint already called by the app.

### E46 — `GET /api/v1/conversations/{conversation_id}/messages`

**Purpose:** Read authorized chronological history.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** path conversation_id; before? opaque history cursor (use instead of cursor). Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "message-example",
      "conversation_id": "conversation-example",
      "sender_user_id": "user-example",
      "content": "Halo, boleh berdiskusi tentang kebutuhan desain?",
      "created_at": "2026-11-09T00:00:00.000Z",
      "read_at": null
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Authorize parent every page; order created_at asc,id for display; page backward via before preserving chronological batch. Recipient read state only, no presence claims.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; history pagination must preserve initial/jump/new-message scroll behavior; equal timestamp tie order needs adapter agreement.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js listMessages → ConversationThread`. This is an adapter mapping, not an endpoint already called by the app.

### E47 — `POST /api/v1/conversations/{conversation_id}/messages`

**Purpose:** Send with trusted session sender.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** path conversation_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "content": "Halo, boleh berdiskusi tentang kebutuhan desain?",
  "client_event_id": "request-example"
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "message-example",
    "conversation_id": "conversation-example",
    "sender_user_id": "user-example",
    "content": "Halo, boleh berdiskusi tentang kebutuhan desain?",
    "created_at": "2026-11-09T00:00:00.000Z",
    "read_at": null
  }
}
```

**Validation / ownership:** Trim visible1–4000 UTF-16 code units; reject empty/zero-width-only/unsupported controls/unknown sender fields. Session derives sender and opposite recipient; never trust message text as payment instructions.

**Errors:** common errors above; 409 IDEMPOTENCY_CONFLICT.

**Pagination / ordering / concurrency:** 201; unique(sender,conversation,client_event_id), same text retry same ID; transaction message+conversation times+recipient notice+retry index.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js sendMessage; customer/seller send → ConversationThread`. This is an adapter mapping, not an endpoint already called by the app.

### E48 — `POST /api/v1/conversations/{conversation_id}/read`

**Purpose:** Mark received messages and corresponding new-message notices read.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** path conversation_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "through_message_id": "message-example"
}
```

**Success JSON example:**

```json
{
  "data": {
    "messages_marked_read": 1
  }
}
```

**Validation / ownership:** Only incoming received records, never sender-owned messages. through_message_id is Proposed safe watermark to avoid reading unseen concurrent arrivals; current demo marks all currently incoming rows. Validate watermark belongs to conversation.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; idempotent monotonic receipts, no If-Match; preserve earlier timestamps; no conversation activity bump.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js markConversationRead; customer/seller markRead`. This is an adapter mapping, not an endpoint already called by the app.

### E49 — `GET /api/v1/messages/unread-count`

**Purpose:** Read role-scoped unread message count.

**Authentication / authorization:** session; authorized participant; role view must also match customer or owned seller profile.

**Parameters:** view=customer|seller; conversation_id? authorized ID. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "count": 0
  }
}
```

**Validation / ownership:** Count only incoming unread in requested role; shared low-level null ID counts all participant roles but customer navigation must not use seller counts.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; no pagination; error is not zero.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js getUnreadCount; customerMessaging.counts; seller inbox unread_count`. This is an adapter mapping, not an endpoint already called by the app.


## Notifications

### E50 — `GET /api/v1/notifications`

**Purpose:** Read recipient role view.

**Authentication / authorization:** session; recipient_user_id equals current account and requested role context.

**Parameters:** view=customer|seller; unread? boolean. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "notification-example",
      "recipient_user_id": "user-example",
      "actor_user_id": "owner-example",
      "type": "booking_accepted",
      "title": "Permintaan diterima",
      "message": "Kreator menerima permintaan layananmu.",
      "related_entity_id": "booking-example",
      "is_read": false,
      "created_at": "2026-11-09T00:00:00.000Z"
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Recipient only plus authorized context: customer booking outcomes/messages; seller requested/messages/new_review. Resolve target safely, never arbitrary payload URL. created_at desc,id.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js listNotifications; customer/seller listNotifications → NotificationBell, NotificationsPage, SellerNotificationsPage`. This is an adapter mapping, not an endpoint already called by the app.

### E51 — `PUT /api/v1/notifications/{notification_id}/read`

**Purpose:** Mark one authorized notice read.

**Authentication / authorization:** session; recipient_user_id equals current account and requested role context.

**Parameters:** path notification_id; view=customer|seller. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "is_read": true
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "notification-example",
    "recipient_user_id": "user-example",
    "actor_user_id": "owner-example",
    "type": "booking_accepted",
    "title": "Permintaan diterima",
    "message": "Kreator menerima permintaan layananmu.",
    "related_entity_id": "booking-example",
    "is_read": true,
    "created_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Only true supported by current UI; recipient + role context verified. Does not mark a related message read.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; idempotent monotonic update, no If-Match required.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js markNotificationRead; role facades`. This is an adapter mapping, not an endpoint already called by the app.

### E52 — `GET /api/v1/notifications/unread-count`

**Purpose:** Count recipient notices in role.

**Authentication / authorization:** session; recipient_user_id equals current account and requested role context.

**Parameters:** view=customer|seller. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "count": 0
  }
}
```

**Validation / ownership:** Same scope as list, not message count; unread indicator unavailable on errors rather than false zero.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; no pagination.

**Exact frontend consumer:** `src/features/messaging/messagingStore.js getUnreadNotificationCount; customerMessaging.counts; seller getUnreadNotificationCount`. This is an adapter mapping, not an endpoint already called by the app.


## Reviews

### E53 — `GET /api/v1/me/review-eligibility`

**Purpose:** Read Completed queue/history eligibility.

**Authentication / authorization:** session; current customer owns Completed booking/review; self-review forbidden.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 0
}
```

**Validation / ownership:** Return {booking,eligible,reason,review} for own Completed records only; no pretend Paid transition or ownership bypass.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js listCompletedBookings → ReviewsPage`. This is an adapter mapping, not an endpoint already called by the app.

### E54 — `GET /api/v1/me/bookings/{booking_id}/review-eligibility`

**Purpose:** Read owned booking review eligibility.

**Authentication / authorization:** session; booking.customer_user_id equals current account.

**Parameters:** path booking_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "booking": {
      "id": "booking-example",
      "customer_user_id": "user-example",
      "seller_profile_id": "creator-example",
      "service_id": "service-example",
      "service_title": "Identitas visual bisnis lokal",
      "seller_name": "Studio Contoh",
      "estimated_price": 1200000,
      "delivery_mode": "remote",
      "requested_date": null,
      "location": null,
      "requirements": "Identitas visual untuk usaha lokal.",
      "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
      "status": "Requested",
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": null,
      "decline_reason": null
    },
    "eligible": false,
    "reason": "Ulasan hanya tersedia setelah booking berstatus Completed.",
    "review": null
  }
}
```

**Validation / ownership:** Owned booking may be non-Completed: return ineligible with reason. Validate seller/service association, self-review and duplicate.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js getEligibility → ReviewFormPage, BookingReviewAction`. This is an adapter mapping, not an endpoint already called by the app.

### E55 — `GET /api/v1/me/reviews`

**Purpose:** Read own verified history.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 0
}
```

**Validation / ownership:** Author session, recheck owned Completed association; created_at desc,id. No arbitrary author ID parameter.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js listOwn → ReviewsPage`. This is an adapter mapping, not an endpoint already called by the app.

### E56 — `POST /api/v1/reviews`

**Purpose:** Submit one verified review.

**Authentication / authorization:** session; current customer owns Completed booking/review; self-review forbidden.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "booking_id": "booking-example",
  "service_id": "service-example",
  "seller_profile_id": "creator-example",
  "rating": 5,
  "comment": "Kolaborasi jelas dan hasil sesuai kebutuhan kreatif kami."
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "review-example",
    "booking_id": "booking-example",
    "service_id": "service-example",
    "seller_profile_id": "creator-example",
    "customer_user_id": "user-example",
    "reviewer_name": "Nama Akun",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "rating": 5,
    "comment": "Kolaborasi jelas dan hasil sesuai kebutuhan kreatif kami.",
    "created_at": "2026-11-09T00:00:00.000Z"
  }
}
```

**Validation / ownership:** Owned Completed booking, real owned Seller Profile, service matches if present, no self-review; integer1–5, trimmed comment10 visible nonwhitespace min/2000 UTF-16 max; server snapshots names, derives author. Retain history if service archived.

**Errors:** common errors above; 409 DUPLICATE_REVIEW; 422 INELIGIBLE, SELF_REVIEW, INVALID_CONTEXT.

**Pagination / ordering / concurrency:** 201; unique booking_id, Idempotency-Key; review+aggregate invalidation+one outbox new_review transaction. No public client event endpoint.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js submit; reviewActions.submit → ReviewFormPage`. This is an adapter mapping, not an endpoint already called by the app.

### E57 — `PATCH /api/v1/reviews/{review_id}`

**Purpose:** Edit own rating/comment only.

**Authentication / authorization:** session; current customer owns Completed booking/review; self-review forbidden.

**Parameters:** path review_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "rating": 4,
  "comment": "Kolaborasi jelas dan hasil sesuai kebutuhan kreatif kami."
}
```

**Success JSON example:**

```json
{
  "data": {
    "id": "review-example",
    "booking_id": "booking-example",
    "service_id": "service-example",
    "seller_profile_id": "creator-example",
    "customer_user_id": "user-example",
    "reviewer_name": "Nama Akun",
    "service_title": "Identitas visual bisnis lokal",
    "seller_name": "Studio Contoh",
    "rating": 4,
    "comment": "Kolaborasi jelas dan hasil sesuai kebutuhan kreatif kami.",
    "created_at": "2026-11-09T00:00:00.000Z",
    "updated_at": "2026-11-09T01:00:00.000Z"
  }
}
```

**Validation / ownership:** Same eligibility/association/text/rating checks; preserve all IDs, snapshots,created_at; set monotonic updated_at. Reject protected fields.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match; refresh all public aggregates atomically; never another new_review event.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js update; reviewActions.update → ReviewFormPage`. This is an adapter mapping, not an endpoint already called by the app.

### E58 — `GET /api/v1/reviews`

**Purpose:** Read sanitized verified reviews.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** service_id?;seller_profile_id?; either/both filters; both conjunctive. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "review-example",
      "service_id": "service-example",
      "seller_profile_id": "creator-example",
      "reviewer_name": "Nama Akun",
      "service_title": "Identitas visual bisnis lokal",
      "seller_name": "Studio Contoh",
      "rating": 5,
      "comment": "Kolaborasi jelas dan hasil sesuai kebutuhan kreatif kami.",
      "created_at": "2026-11-09T00:00:00.000Z",
      "verified": true
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Only public projection; never booking_id/customer_user_id/contact/brief. Valid owner/service relationships; archived service may be labeled historical. created_at desc,id.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js listPublic → PublicReviews, MarketplacePage`. This is an adapter mapping, not an endpoint already called by the app.

### E59 — `GET /api/v1/reviews/summary`

**Purpose:** Read verified rating average/distribution.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** service_id?;seller_profile_id?. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "total": 0,
    "average": null,
    "distribution": [
      {
        "rating": 5,
        "count": 0,
        "percentage": 0
      },
      {
        "rating": 4,
        "count": 0,
        "percentage": 0
      },
      {
        "rating": 3,
        "count": 0,
        "percentage": 0
      },
      {
        "rating": 2,
        "count": 0,
        "percentage": 0
      },
      {
        "rating": 1,
        "count": 0,
        "percentage": 0
      }
    ]
  }
}
```

**Validation / ownership:** Same publication/filter source as review list; no illustrative testimonials. total0→average null; distribution5→1 percentages0.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; summary no pagination; invalidate on rating edits.

**Exact frontend consumer:** `src/features/reviews/reviewStore.js getSummary/summarizeReviews → VerifiedRating, ReviewSummary`. This is an adapter mapping, not an endpoint already called by the app.


## Locations and Nearby

### E60 — `GET /api/v1/me/location`

**Purpose:** Read current private saved preference.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "version": 1,
    "city": "Makassar",
    "coordinates": null,
    "source": "city",
    "consent": false
  }
}
```

**Validation / ownership:** Owner-only, no public/admin projection; absence returns data:null. Never silently use another account cached point.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; private no-store; ETag.

**Exact frontend consumer:** `src/features/account/demoStore.js getBuyerLocation → useBuyerLocation, ProfilePage`. This is an adapter mapping, not an endpoint already called by the app.

### E61 — `PUT /api/v1/me/location`

**Purpose:** Explicitly save private preference.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "version": 1,
  "city": "Makassar",
  "coordinates": null,
  "source": "city",
  "consent": false
}
```

**Success JSON example:**

```json
{
  "data": {
    "version": 1,
    "city": "Makassar",
    "coordinates": null,
    "source": "city",
    "consent": false
  }
}
```

**Validation / ownership:** version1; city≤120; city-only ≥2 chars, coordinates null,source city,consent false. Non-null point requires finite lat/lng legal ranges, source manual/geolocation and consent true. Browser permission alone never invokes save.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match for existing resource, If-None-Match: * for create when GET returns data:null; return ETag. Session-only points remain off this endpoint.

**Exact frontend consumer:** `src/features/account/demoStore.js updateBuyerLocation → BuyerLocationForm, DeviceLocationPanel`. This is an adapter mapping, not an endpoint already called by the app.

### E62 — `DELETE /api/v1/me/location`

**Purpose:** Clear current saved private preference.

**Authentication / authorization:** session; current account only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success response:** `204`, no body.

**Validation / ownership:** Only own saved location; UI also clears RAM point and suppresses auto reacquisition until explicit retry. No account deletion.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 204; idempotent; no coordinates in audit payload/logs; require current ETag when clearing an existing preference to reject stale deletions.

**Exact frontend consumer:** `src/features/account/demoStore.js clearBuyerLocation → NearbyServicesPage, BuyerLocationForm`. This is an adapter mapping, not an endpoint already called by the app.

### E63 — `PUT /api/v1/me/seller-profile/location`

**Purpose:** Set intentionally public area/pin or service inheritance.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "public_location": {
    "version": 1,
    "visibility": "area",
    "area": "Wilayah studio publik",
    "coordinates": null,
    "confirmed": false
  }
}
```

**Success JSON example:**

```json
{
  "data": {
    "version": 1,
    "visibility": "area",
    "area": "Wilayah studio publik",
    "coordinates": null,
    "confirmed": false
  }
}
```

**Validation / ownership:** version1; area≤120; hidden=empty area/null coordinates/confirmed false; area=label≥2/null/false; pin=label≥2/valid coordinates/confirmed true. Null service override inherits; explicit hidden suppresses inheritance. Remote public service point always null.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match on parent; endpoints proposed convenience views over existing full profile/service writes, not new location store.

**Exact frontend consumer:** `src/features/account/demoStore.js updateSellerProfile → SellerProfilePage`. This is an adapter mapping, not an endpoint already called by the app.

### E64 — `PUT /api/v1/seller/services/{service_id}/location`

**Purpose:** Set intentionally public area/pin or service inheritance.

**Authentication / authorization:** seller; exact owned profile and resource relationship.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "service_location": null
}
```

**Success JSON example:**

```json
{
  "data": null
}
```

**Validation / ownership:** version1; area≤120; hidden=empty area/null coordinates/confirmed false; area=label≥2/null/false; pin=label≥2/valid coordinates/confirmed true. Null service override inherits; explicit hidden suppresses inheritance. Remote public service point always null.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match on parent; endpoints proposed convenience views over existing full profile/service writes, not new location store.

**Exact frontend consumer:** `src/features/seller/sellerStore.js update → ServiceFormPage`. This is an adapter mapping, not an endpoint already called by the app.

### E65 — `POST /api/v1/services/nearby-search`

**Purpose:** Non-persisting discovery query with private origin.

**Authentication / authorization:** public; sanitized, published/moderation-aware data only.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "mode": "onsite",
  "q": "",
  "category": "",
  "city": "Makassar",
  "origin": null,
  "radius_km": null,
  "limit": 20,
  "cursor": null
}
```

**Success JSON example:**

```json
{
  "data": [],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 0
}
```

**Validation / ownership:** Mode onsite/remote; only Open active nonhidden legitimate owned services. Match public area OR legitimate public seller city, never infer points. Radius(0,20000] requires valid origin+onsite. Haversine straight-line; unknown distance excluded under radius, sorted last otherwise. Remote separate/no map.

**Errors:** common errors above; 422 VALIDATION_FAILED; 503 DATA_INTEGRITY.

**Pagination / ordering / concurrency:** 200; read-only POST avoids private coordinates in URLs. Cursor/limit in body; no cache/logging of origin/body. Return public service coordinates only, distance_km nullable, never echo buyer origin; filtering does not save it.

**Exact frontend consumer:** `src/features/location/discovery.js discoverServices → NearbyServicesPage`. This is an adapter mapping, not an endpoint already called by the app.


## Admin monitoring/moderation

### E66 — `GET /api/v1/admin/accounts`

**Purpose:** Read limited account/seller summaries.

**Authentication / authorization:** admin; explicit admin:access from trusted permissions.

**Parameters:** q?,role=all|customer|seller|admin. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "user-example",
      "name": "Nama Akun",
      "email": "account@example.invalid",
      "created_at": "2026-11-09T00:00:00.000Z",
      "is_customer": true,
      "is_seller": false,
      "seller_profile_id": null,
      "seller_name": "",
      "seller_category": "",
      "seller_city": "",
      "is_admin": false,
      "is_self": false
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Current store method returns all authorized summaries; query filtering Proposed. Never credentials/private buyer location. is_customer always true including sellers/admins.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/account/demoStore.js listAccountsForAdmin → AdminAccountsPage`. This is an adapter mapping, not an endpoint already called by the app.

### E67 — `GET /api/v1/admin/bookings`

**Purpose:** Read-only booking monitoring.

**Authentication / authorization:** admin; explicit admin:access from trusted permissions.

**Parameters:** status?,seller_profile_id?,customer_user_id?,q?,date_from?,date_through? (canonical UTC creation-date slices, inclusive). Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "booking-example",
      "customer_user_id": "user-example",
      "seller_profile_id": "creator-example",
      "service_id": "service-example",
      "service_title": "Identitas visual bisnis lokal",
      "seller_name": "Studio Contoh",
      "estimated_price": 1200000,
      "delivery_mode": "remote",
      "requested_date": null,
      "location": null,
      "requirements": "Identitas visual untuk usaha lokal.",
      "description": "Kami membutuhkan konsep visual yang konsisten untuk peluncuran usaha.",
      "status": "Requested",
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": null,
      "decline_reason": null
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Monitoring only; no generic status write. Minimize brief/address exposure to actual UI need; exact admin detail DTO policy needs agreement. created_at desc,id.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/customer/customerStore.js adminView → AdminOrdersPage`. This is an adapter mapping, not an endpoint already called by the app.

### E68 — `GET /api/v1/admin/services`

**Purpose:** Read visible/hidden/archived catalog for moderation.

**Authentication / authorization:** admin; explicit admin:access from trusted permissions.

**Parameters:** q?,visibility=all|live|hidden; source=demo|seller?;category?. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": [
    {
      "id": "service-example",
      "seller_profile_id": "creator-example",
      "title": "Identitas visual bisnis lokal",
      "category": "Branding",
      "description": "Rancangan identitas visual untuk kebutuhan bisnis kreatif lokal.",
      "price": 1200000,
      "delivery": "Remote",
      "turnaround": "7 hari kerja",
      "availability": "Open",
      "image_url": null,
      "active": true,
      "service_location": null,
      "created_at": "2026-11-09T00:00:00.000Z",
      "updated_at": "2026-11-09T00:00:00.000Z",
      "source": "seller",
      "hidden": false,
      "hidden_reason": "",
      "hidden_at": null
    }
  ],
  "page": {
    "next_cursor": null,
    "has_more": false
  },
  "total": 1
}
```

**Validation / ownership:** Include current moderation metadata and source, but do not treat editorial records as bookable; no account credential/contact join. Preserve UI hidden bucket semantics: hidden OR inactive; live means active AND not hidden.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; standard list cursor/limit where a list is returned; item reads have no pagination. GET is side-effect free. No inferred authorization from request IDs.

**Exact frontend consumer:** `src/features/seller/sellerStore.js adminList → AdminModerationPage`. This is an adapter mapping, not an endpoint already called by the app.

### E69 — `PUT /api/v1/admin/services/{service_id}/moderation`

**Purpose:** Hide/restore existing service.

**Authentication / authorization:** admin; explicit admin:access from trusted permissions.

**Parameters:** path service_id. Common list parameters apply only to list responses.

**Request JSON:**

```json
{
  "hidden": true,
  "reason": "Konten perlu ditinjau sesuai pedoman layanan."
}
```

**Success JSON example:**

```json
{
  "data": {
    "service_id": "service-example",
    "hidden": true,
    "reason": "Konten perlu ditinjau sesuai pedoman layanan."
  }
}
```

**Validation / ownership:** Hide reason trimmed5–300; restore hidden=false removes current hidden record. Moderator derived session. Never grants seller/admin capabilities or completes bookings. Applies editorial moderation only after editorial storage decision.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; If-Match; audited transaction, serialize with new booking eligibility; preserve original seller metadata.

**Exact frontend consumer:** `src/features/seller/sellerStore.js moderate → AdminModerationPage`. This is an adapter mapping, not an endpoint already called by the app.

### E70 — `GET /api/v1/admin/overview`

**Purpose:** Read derived monitoring counts.

**Authentication / authorization:** admin; explicit admin:access from trusted permissions.

**Parameters:** none. Common list parameters apply only to list responses.

**Request JSON:**

```json
null
```

**Success JSON example:**

```json
{
  "data": {
    "accounts": 0,
    "seller_profiles": 0,
    "bookings": 0,
    "services": 0,
    "hidden_services": 0
  }
}
```

**Validation / ownership:** Derived only from authorized reliable account/booking/catalog sources; do not fabricate paid revenue. Proposed aggregation convenience; current useAdmin derives from three views.

**Errors:** common errors above.

**Pagination / ordering / concurrency:** 200; no pagination; failure not all-zero dashboard.

**Exact frontend consumer:** `src/features/admin/useAdmin.js → AdminOverviewPage`. This is an adapter mapping, not an endpoint already called by the app.

## Internal events, not public notification-writing endpoints

`notifyBookingEvent`, `notifyReviewEvent`, customer `notifyRequested`, the booking bridge and `reviewActions.retryNotification` are existing demo integration methods. **Do not expose them as arbitrary public create-notification or arbitrary recipient APIs.** Production booking/review/message transactions should create uniquely keyed outbox events; authorized server workers deliver notices. A failed delivery remains pending, not a failed booking/review. If a diagnostic delivery-retry endpoint is later needed, define separate operational authority and rate limits; there is no current production endpoint or customer right to manufacture events.

Proposed real-time transport may publish authorized invalidation hints with cursors; REST remains the source of truth. No transport is selected. No endpoint for Customer mark-paid, arbitrary booking status, admin permission granting, seller verification, account suspension, payouts, review deletion, chat attachments or global read-all is included. Those are not current product capabilities.

## Consumer adaptation notes

- Preserve existing method names at an asynchronous adapter boundary; never turn a sync injected resolver into an unnoticed Promise. Mutating responses must refresh account/catalog/booking/review dependents and clear old account caches on logout/switch.
- Canonical snake_case responses require explicit mapping back to current account/service/booking camelCase UI models. Exact messaging/review records need no aliases; inbox decorations/counts belong in response envelopes/view models, not persisted contracts.
- Existing `expectedUserId` / `expected_user_id` remain client stale-form guards and should never select a server actor. The backend uses the authenticated session only.
- Existing static gallery/portfolio/editorial data need a content decision; current service CRUD accepts one image URL, not a new multi-file upload API. No media upload is implied by these endpoints.
- Cursor-based pagination is new: current demo reads entire collections. Adapt inbox newest-first and message-history oldest-first display deliberately, plus aggregate totals independent of current page length.

# Identity, permissions and security boundary

## Confirmed unified account behavior

Source: [demoStore.js](../../src/features/account/demoStore.js), [Guards.jsx](../../src/features/account/Guards.jsx), [AuthProvider.jsx](../../src/features/account/AuthProvider.jsx), [profileValidation.js](../../src/features/account/profileValidation.js).

Registration creates one account with buyer access, no selectable role, no permissions and no Seller Profile. Activation creates a distinct `creator-…` profile ID associated with the current account; the account retains buyer capabilities. Current seller capability requires the reciprocal account/profile association and matching owner. Viewing a public creator never grants capabilities. Email spelling, email domain, display name and knowledge of a profile ID never confer seller/admin privileges.

`admin:access` is an explicit stored internal permission, independent of seller capability. An admin without an owned seller profile cannot use seller management; a seller without admin permission cannot use admin endpoints. Admin has no general private-chat bypass or review-author bypass.

`expectedUserId` and review `expected_user_id` reject stale forms after account switching; they are not credentials and must not become server authorization parameters. The session supplies the actor for writes. Profile updates whitelist personal fields; neither ID, email, seller association nor permissions can be edited there. Password changes verify current password, validate confirmation and recheck session after asynchronous work; the demo preserves its current session.

## Authorization matrix

| Operation | Anonymous | Current account as customer | Owned seller capability | Explicit admin |
| --- | --- | --- | --- | --- |
| Visible catalog/creator/reviews/Nearby | Yes, sanitized | Yes | Yes | Yes |
| Own profile/settings/private buyer location | No | Own only | Same own account | Same own account |
| Favorites/cart/create booking | No | Own; no self-booking | Own buyer access retained | Own buyer access, no bypass |
| Private customer order | No | customer_user_id matches | Only if also its customer; seller view otherwise | Monitoring endpoint only |
| Activate seller | No | Once, current account | Duplicate denied | Same account rules |
| Manage service/profile/schedules | No | No | Match owned profile and service | No seller bypass |
| Accept/decline/complete booking | No | No | Owned service profile + allowed state | No transition bypass |
| Review submit/edit | No | Own Completed booking/review, no self-review | Only as eligible buyer of another seller | No bypass |
| Customer inbox/thread | No | Conversation.customer_user_id matches | Same buyer view if customer | Same buyer rules |
| Seller inbox/thread | No | No | Conversation.seller_profile_id matches owned profile | No bypass |
| Shared chat read/send/receipt | No | Customer participant | Actual owning seller participant | Not by permission alone |
| Notification read/count | No | Recipient + customer context | Recipient + seller context | Only own participant context |
| Account/order monitoring, hide/restore service | No | No | No | Explicit admin only |
| Grant admin/suspend/verify seller | No | No | No | No current application capability; trusted provisioning is separate |

Ownership must be checked on each command and every paginated/read query. Foreign private IDs should be indistinguishable from nonexistent IDs. Join account → seller profile → service/booking on the server; a submitted seller_profile_id or sender_user_id is never sufficient. Minimal customer names/avatars should be resolved only for authorized booking/chat participants. The demo `customerNames/customerIdentities` helpers gate on seller/admin but accept IDs supplied by callers; do not expose an unrestricted equivalent directory endpoint.

## Safe navigation

[redirects.js](../../src/features/account/redirects.js) allows known local route syntax, preserves query/hash, rejects external/protocol-relative, encoded pathname, backslash, control, malformed and authentication-loop destinations. Route guards still run after redirect; accepted URL syntax grants no permission. Default login/registration lands on Homepage.

Confirmed coverage gap: the current nested seller allowlist supports service edit but does not include the actual `/seller-dashboard/services/:serviceId/availability` route. The handoff does not change it. Backend sessions must not broaden redirects to external origins to address this mismatch. Test each actual nested route with the updated allowlist during integration.

## Development-only admin process (Confirmed, never production)

Files: [demoAdminProvisioner.js](../../src/dev/demoAdminProvisioner.js), [demoAdmin.js](../../src/dev/demoAdmin.js), [adminSetup.js](../../src/dev/adminSetup.js), [devAdminPlugin.js](../../devAdminPlugin.js), [vite.config.js](../../vite.config.js). Provisioning requires Vite development mode and loopback access, and explicit selection/confirmation of the currently signed-in account ID. The optional dedicated setup reads a password privately from an ignored local environment file and exposes only a same-origin explicit loopback setup action. It does not grant rights by email. No environment contents, account-specific credentials or provisioning records are reproduced here. These modules are outside the production app graph; they are demo conveniences, not server security.

Production must remove reliance on browser-editable admin records. **Proposed:** trusted operator/bootstrap process or organization identity authorization, least privilege, audited grants/revocation and no public registration permission field. Exact process is an open decision; do not create an administrative grant API merely because a demo tool exists.

## Proposed production security responsibilities

- Authentication: trusted server credential verification using a maintained password-hashing library and appropriate adaptive parameters; never reuse browser demo verifiers. Enforce unique normalized account email in the database. Generic login failures, login throttling and reauthentication for sensitive changes. Password reset/email verification are future decisions, not existing features.
- Sessions: opaque server-managed session with rotation at login, Secure/HttpOnly cookie, appropriate SameSite, bounded lifetime and server revocation. No authentication secret in localStorage or public DTOs. Agree expiry, concurrent sessions and post-password-change revocation policy; current demo persistence is not that policy.
- CSRF/CORS: cookie-authenticated mutation protection (token/origin checks as deployment permits), narrow allowed origins with credentials, no wildcard credentials. Validate Origin/Host and proxy trust at the server. SameSite alone is not a blanket substitute. Deployment origin decisions precede configuration.
- Authorization: server-enforced ownership/explicit permissions on every request, including real-time subscriptions. Reject actor, owner, price, status, permissions and generated-ID injection. Avoid permission inference from email text. Never authorize from a client `capabilities` array.
- Validation: server schema and length/range/enum/relationship validation, parameterized database access, plain-text message/review rendering and safe output encoding. Client safeguards improve UX only.
- Privacy: exclude credentials, session records, private buyer GPS, full briefs and contact fields from public projections. Logs redact credential bodies, private-location/search origins, sensitive booking data and operational errors; stable redacted request IDs support diagnosis. Limit administrative projections to actual monitoring needs.
- Media: current UI accepts URLs, not uploaded files. Production URL policy and proxying require SSRF protection if fetched server-side (scheme/host/IP checks, redirect limits, size/time bounds). Future uploads need authenticated ownership, MIME/content validation, size limits, safe storage origin, malware controls and URL lifecycle; no upload endpoint is implemented or assumed here.
- Integrity/concurrency: FK/unique constraints, atomic transitions, null-safe conversation uniqueness, unique booking review, monotonic read receipts, optimistic revisions and request idempotency. Serialize deletion vs booking creation; never translate a failed booking query into count zero.
- Notifications: transactional outbox and unique event keys; session users cannot choose arbitrary recipients. No message text is trusted as a payment instruction. Real payment confirmation must originate from a verified provider integration, not a UI action or chat.
- Abuse: rate-limit authentication, booking, message, review and notification-related writes; bound list sizes and query complexity. Define retention/export/deletion and operational recovery separately. Backups and explicit recovery must not silently erase damaged records.

These are recommendations, not claims about present frontend enforcement against an attacker. Browser localStorage is editable and shared by users of that browser origin; it provides neither trusted authorization nor cross-device identity.

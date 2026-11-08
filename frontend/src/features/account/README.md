# Unified demo accounts (Phase 5)

One account always has buyer capabilities. Seller capability is derived from an
owned Seller Profile, not a registration role or email address. The seller profile
ID is generated with crypto.randomUUID and linked to its owner's account ID.

Storage: `digarsa.demo.accounts.v1` in localStorage holds a versioned account list,
profile list, and active demo session. Passwords are verified using a per-account
random salt and PBKDF2/SHA-256 (100,000 iterations); plaintext passwords are not
persisted. User context excludes credential material. Reloading restores the
session; logout clears the session while preserving demo accounts and profiles.
Storage events update other tabs. Failed writes are surfaced to the user.

This is a hackathon simulation, not production authentication. Anyone controlling
the browser can alter stored records, sessions, and permissions. There is no
server, secure cookie, identity verification, or cross-device account recovery.
Concurrent writes from separate tabs are not transactional. Use demo-only data.

Registration always starts with empty permissions and no Seller Profile.
`admin:access` is an explicit internal permission, read from an account record;
there is no public provisioning method, UI selector, or email-based escalation.
Tests seed internal permission fixtures directly to verify the boundary.

Seller activation ignores caller-supplied owner IDs, rejects a second activation,
and requires a current session. Owned-profile reads verify both owner ID and the
account association. Buyer permissions remain after activation.

Return-to destinations are allow-listed local paths. Authentication paths,
external URLs, encoded paths, backslashes, and control characters are rejected.
Queries on approved pages are preserved. A brief success state precedes redirect.

Account navigation destinations and Seller Center are protected development
shells. Favorites, orders, messaging, booking, checkout, seller management, and
publishing new profiles into the public mock catalog remain future work.


## Local Admin demo provisioning

Ordinary registration intentionally creates accounts with no admin permissions.
For local testing only, start `npm run dev -- --host 127.0.0.1`, register a dedicated
demo account with a demo-only password, and stay signed in. Open DevTools on that
same localhost origin and run these steps explicitly:

```js
const demoAdmin = await import('/src/dev/demoAdmin.js');
demoAdmin.currentDemoAccount(); // Inspect the ID and confirm this is your test account.
// Paste that exact ID after inspecting the account; no email matching is used.
demoAdmin.provisionDemoAdmin('PASTE_CURRENT_DEMO_ACCOUNT_ID');
location.reload();
```

Visit `/admin`, or use Admin Dashboard in the existing account menu. Login still
lands on Homepage by default; accessing `/admin` as a guest retains that protected
return destination. Refresh preserves the local session. Logout revokes the active
session; it does not remove the deliberately provisioned permission from the account.

This module is never imported into the application graph or included in `dist`.
Its functions also require Vite development mode and a loopback hostname; production
preview/builds cannot use this workflow. It adds only `admin:access` to the specified
currently signed-in account and preserves IDs, credentials, seller profiles, and
other accounts. It does not create passwords, grant permissions by email, or expose
a public role selector. Reload after provisioning so existing subscribers reread
storage. Corrupt/unavailable storage aborts without repair or reset.

Browser localStorage is editable demo data, not production authorization. A real
Admin provisioning system requires a trusted backend and is outside this phase.

## Phase A navigation behavior

Normal login and registration return to `/`. An explicit safe protected return path
(including booking, onboarding, Seller, and Admin routes) is preserved. Auth pages
are not valid return destinations, preventing login/register redirect loops. Route
guards continue checking account, Seller Profile ownership, and `admin:access`.

### Phase A verification

- Reproduced: default registration/login target `/dashboard`; changed to `/`.
- Reproduced: ordinary accounts are denied `/admin` because they have no explicit
  permission. The guard is correct; development provisioning was the missing
  supported workflow. Existing documentation previously suggested manual storage
  edits by email; it now points to the ID-scoped tool above.
- Not reproduced: all nine account dropdown destinations navigated correctly and
  closed the menu at 1440px, 768px, and 390px in the in-app browser before any menu
  changes. AccountMenu, Navbar, routes, and CSS were deliberately left unchanged.
- Browser checks: normal login/registration reached Homepage; a protected booking
  return retained query/hash; guest Admin and nested Seller returns worked;
  provisioned synthetic Admin reached `/admin` and survived refresh; Customer and
  Seller were denied; logout revoked the active session. Outside click, Tab/Enter,
  Escape, account switching, and destination refresh worked. Profile layout had no
  horizontal overflow at 390px. Temporary test fixture import pages were removed.
- Admin browser checks used synthetic accounts generated by the same provisioning
  factory. The documented DevTools import workflow was not executed interactively.
- Automated checks: lint, build, 156 tests, and `git diff --check` passed. Build
  artifacts contain neither provisioning entry point nor factory. Four new tests
  cover default/safe redirects and provisioning authorization, persistence,
  preservation, idempotency, and storage failures.

A browser-specific dropdown issue remains possible outside the tested in-app
browser. If it recurs, capture the browser/version and failed interaction rather
than changing routes or weakening focus/authorization checks without evidence.

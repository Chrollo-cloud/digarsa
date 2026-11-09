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

Authenticated accounts can use Dashboard, Profile, Settings, Favorites, Cart
(consideration list), Orders, Reviews, Messages, and Notifications. An owned Seller
Profile enables Seller Center, public service publishing/management, incoming
orders, seller messaging/notifications, and estimated earnings, while preserving
buyer capabilities. Internal Admin access remains a separate permission.

Booking lifecycle: Requested → Accepted → Paid → Completed. Sellers may accept or
decline Requested bookings; only an existing valid Paid booking can be completed.
Declined and Cancelled are alternative terminal outcomes. Checkout and real payment
confirmation are not implemented. Accepted stays Accepted until a future legitimate
payment flow records Paid; there is no demo pay action or automatic payment/completion.
Reviews require Completed bookings. Browser storage remains a local demo rather than
server authentication, payment verification, or cross-device synchronization.


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

## Pre-backend account refinements

Native Safari reproduced a failed Profil Saya click: focus left the menu with a
null relatedTarget before click and synchronous blur dismissal removed the anchor.
Internal pointerdown now keeps the menu mounted through activation. Keyboard blur,
outside pointer and Escape still dismiss, without cancelling native link clicks.
The grouped menu retains customer links, explicit seller/admin guards and logout.
Customer Pesan Saya / Notifikasi Saya now count only buyer contexts; Seller Center
keeps its independent role-scoped view over the same shared repository. Keranjang
reuses the unchanged /cart store and individual booking links (no migration/payment).

### Dedicated local Admin account using an ignored environment file

1. Edit `frontend/.env.demo-admin.local` privately and set
   `DIGARSA_DEMO_ADMIN_PASSWORD` to your chosen demo-only password. This file is
   ignored by Git. Never prefix the variable with VITE_; never commit the password.
   If the local file is absent, create it with that one variable.
2. Run `npm run dev -- --host 127.0.0.1` from frontend. Open
   `http://127.0.0.1:5173/__demo/admin` (use Vite's actual port).
3. Explicitly create the dedicated srikandi@gmail.com demo account, or choose login
   if it already exists. Existing credentials are never overwritten. A wrong
   password fails normally. The password is read by the dev server only, sent over
   loopback only after your explicit same-origin setup action, and used by the
   existing demoStore register/login methods; it is never a client env constant.
4. Inspect the shown account ID/email, type that exact ID, then explicitly activate
   Admin. Email selects this setup's dedicated account, never grants permission.
   The existing localhost development provisioner verifies the signed-in ID before
   adding admin:access. Reload the app; visit /admin. Ordinary users remain denied.
5. To revoke, log in through the same setup page, inspect/type the ID and choose
   Cabut Admin. Reload. Logout clears only the session. Delete/empty the local env
   file when finished (revocation is a separate explicit action).

The setup endpoint requires a loopback connection and Host, matching Origin, POST and custom
same-origin header. Responses use no-store. It exists only in Vite configureServer,
not preview or production. Setup source is outside the production import graph.
This is an explicit development convenience, not secure production provisioning:
localStorage and localhost demo credentials are accessible to the local user.
The requested real account cannot be provisioned until its password is supplied
privately in the ignored file. Never reuse a production password for this demo.

### Customer account UI refinement

The global account dropdown is the account navigation source; repeated page-wide
navigation rows are removed. Seller Center remains only in the main navbar for
activated sellers. `accountLinkActive` mirrors App routes: Dashboard/Profile/Settings
match exactly; Orders and Messages include their existing detail routes; Reviews
also matches `/review/:bookingId`. Pointer opening does not autofocus Dashboard.
Keyboard opening still focuses the menu. Both account and notification overlays
handle Escape at document capture while open so native Safari's pointer-focus
behavior cannot leave Escape inactive. The existing internal-pointer blur guard
remains intact. No permissions, providers, account stores or route guards changed.

The customer-only notification bell uses the existing customerMessaging facade and
shared repository, with All/Unread filters, a maximum of eight recent items, mark
read, authorized destinations and View All. Mobile links to the full notifications
page, which uses the same read states. No email/push preferences are simulated.
Dashboard metrics count current owned bookings by real lifecycle status; recent
orders use createdAt. Status bars show categorical counts, not trends or payment
history. Settings contains security/session controls and privacy information;
personal identity fields and private location remain on Profile. Favorites and
cart retain their original storage keys and account isolation. No data migration.

# Customer Profile & Account Settings milestone

Preflight: `feature/customer-profile`, clean working tree, repository root
`/Users/chrollo/Documents/digarsa-logicodix`. The original profile JSX and CSS were
read as the visual/UX reference, not copied. The new pages follow its 900px shell,
compact white bordered card, 62px avatar, 38px maximum card padding, two-column
fields, editorial heading, confirmation dialog, and mobile single-column layout.
The shared layout already reserves navbar height; page padding accounts for that.

## Supported features

Authenticated `/profile` and `/settings` use the existing RequireAccount guard and
AuthProvider. There is no separate customer identity for sellers.

Profile fields: display name, optional HTTP(S) photo URL, phone, birth date, and
gender. Email is visible/read-only. Broken or absent photos fall back to initials.
Photo URLs load only after save, with no referrer. Clearing the URL restores initials.
Profile edits are reviewed in a native accessible dialog before persistence.

Account creation timestamps are recorded for new registrations. Legacy accounts
without that metadata display an explicit unavailable message; dates are not
invented. Active Seller Profiles are reported on the profile page.

Settings reuses the personal-information form, adds a current-password-verified
password change form and a visible logout action. Password fields have distinct
labels, autocomplete hints, visibility controls, loading and error/success feedback.
Native constraints plus store validation cover required fields and password length;
the store checks confirmation and rejects reuse of the current password.

## Store changes and ownership

The existing `digarsa.demo.accounts.v1` schema accepts additive optional profile
fields and `createdAt`; no migration, new identity, or new storage system is used.
`updateProfile` only accepts profile fields and requires the expected active user ID.
Caller-selected IDs, email, privileges, seller association, and credential patches
are rejected. Existing account IDs, buyer capabilities, Seller Profiles, internal
permissions, and Phase 6 customer records remain untouched.

`changePassword` verifies the current PBKDF2 verifier, generates a new salt and
verifier, then re-reads the store. A changed session token, owner, or password aborts
the write. Other profile edits made during hashing are preserved. Plaintext passwords
are never persisted or exposed through the provider's public user object.

Existing store notifications update the navbar and dashboard; AuthProvider and
Navbar.jsx did not need changes. Corrupt account records or inaccessible/quota-limited
storage surface clear failures without overwriting stored data. Device owners can
still alter local records: this remains demo-only, not production security.

## Files

Added under `frontend/src/features/profile/`:
- Avatar.jsx
- LogoutButton.jsx
- PasswordChangeForm.jsx
- PersonalInfoForm.jsx
- ProfileLayout.jsx
- ProfilePage.jsx
- SettingsPage.jsx
- profile.css
- README.md

Also added:
- frontend/src/features/account/profileValidation.js
- frontend/tests/profile.test.js

Modified:
- frontend/src/App.jsx: two page imports; replace /profile shell and add /settings,
  both inside the existing account guard. Seller/admin routes unchanged.
- frontend/src/features/account/demoStore.js: additive profile metadata, update and
  password methods, safe storage/schema reads.
- frontend/src/features/account/PasswordInput.jsx: optional label for the three
  password fields; existing auth defaults remain unchanged.
- frontend/src/features/account/AccountMenu.jsx: Settings link and removal of the
  profile future-feature label; no navbar structure/style changes.
- frontend/src/features/account/redirects.js: allow /settings as a safe local return.

## Verification

38 tests pass: 27 previous tests plus 11 profile/settings tests covering account
isolation, whitelisted updates, name changes, password verification and errors,
confirmation mismatch, session persistence, metadata, Seller Profile preservation,
Phase 6 booking ownership, mid-verification account switches, concurrent profile
edits, and corrupt/unavailable storage. ESLint and production build pass.

Browser checks: display, save confirmation, Escape cancellation, reload persistence,
photo URL, initials fallback, name propagation to navbar/dashboard, unchanged booking
summary counts, invalid phone errors, required password constraints, logout and
protected settings return. Both pages checked at 1440, 1024, 768 and 390px without
horizontal overflow. Password changes themselves were verified by automated isolated
store tests; browser verification covered form validation without changing the demo
account's password. Test name/photo/phone edits were restored after verification.

## Limitations / deliberately excluded

No email editing, file upload, address/map/geolocation, password recovery, backend
API, payments, or seller/admin management. Photos use URLs and depend on that host
being available; initials provide a fallback. The profile contains only supported
account fields, rather than reproducing the prototype's address/location form.
No dedicated Safari run or rendered pixel-diff comparison was performed.
Browser storage has no production authorization or cross-tab transaction guarantee.

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

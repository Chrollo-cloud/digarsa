# Opt-in localhost booking fixture

Start `npm run dev -- --host 127.0.0.1`, then open `/src/dev/bookingSetup.html` on the same origin/port. This entry is not imported by the application or built into production. It requires Vite development mode and loopback hostname.

Choose two demo-only passwords privately, or use the explicit random-password button. Setup uses normal registration, Seller Profile activation and service creation. Existing-email collisions are rejected; accounts are never adopted or overwritten. Repeat setup reuses recorded identities/services. Passwords are not stored in the registry/source. Keep the setup tab open when using generated passwords.

1. Setup leaves Buyer signed in. Open Marketplace in a new tab, search “demo”, add an eligible service to cart and open the cart icon.
2. Start an individual request, enter the brief and a present/future date for onsite work, review and confirm. Open Pesanan.
3. In the setup tab explicitly sign in as Seller; refresh the application tab, open Seller Center → Pesanan Masuk and accept or decline. Switch back to Buyer to track that same order.
4. Nearby: use onsite mode, Makassar city and no radius, or manually choose a nearby synthetic test origin with matching radius. Public sample point is labeled synthetic QA, never geocoded from city text or copied from private location.
5. Reset archives tracked fixture services only; accounts, orders and messages remain intact. Setup after reset creates a new service set. This is not a destructive history/account reset. No fake bookings or Paid records are seeded.

Checkout/payment-demo routes are absent at this baseline. Accepted remains accepted pending legitimate payment integration. Teammate checkout/reset work stays deferred until its branch is reviewed. Demo seller activation requires ownership, not identity verification.

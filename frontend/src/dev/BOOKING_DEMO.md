# Local booking and payment demo

Run `npm run dev -- --host 127.0.0.1`, then open `/src/dev/bookingSetup.html` on the same origin and port. This setup page is available only in Vite development mode on localhost and is not included in the production build.

Enter two private demo-only passwords or generate random passwords. Setup uses normal registration, Seller Profile activation, and service creation. Existing email collisions are rejected; accounts are never adopted or overwritten. Passwords are not saved in the fixture registry. Keep the setup tab open if you need generated passwords to switch sessions.

1. Create the Buyer and Seller accounts and services. Setup leaves the Buyer signed in.
2. Open Marketplace in another tab, choose an available service, create a booking request, and visit `/orders` to view it.
3. In the setup tab, switch to Seller. Refresh the app tab and open `/seller-dashboard/orders`; accept the booking and confirm its final price.
4. Switch back to Buyer and refresh. Open the order from `/orders`, then choose Demo payment or open `/payment/:bookingId` with that booking's ID.
5. The payment screen is an explicit simulation. It records a demo status in local browser data only; no money moves and no bank confirmation occurs.

Customer routes require a signed-in account and only show that account's bookings. Seller order routes require an active Seller capability and only show Seller-owned bookings. Do not remove these checks for testing. Reset archives fixture-owned services only; accounts, bookings, and conversations remain intact. No bookings or Paid entries are seeded.

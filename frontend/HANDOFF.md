# Digarsa Phase H frontend handoff

This frontend continues to use the unified account model and existing customer, seller, messaging/notification, and review stores. Checkout and payment are demo flows over browser-local records; localStorage is not a database, does not provide cross-device synchronization, and is not a security boundary.

## Existing architecture reused

- `src/features/account/demoStore.js` remains the account/session authority. A seller is a capability attached to a normal buyer account through an owned Seller Profile; registration cannot grant seller or admin permission.
- `src/features/customer/customerStore.js` remains the single booking/cart/favorites store. Customer and Seller operations mutate the same booking records through existing clients and ownership checks.
- Seller service ownership and availability come from the seller catalog overlay and current marketplace catalog. Checkout revalidates availability and Seller Profile ownership in the store.
- `src/features/messaging/messagingStore.js`, its contracts/adapters, and the review store remain authoritative for shared notifications and verified review eligibility.

## Cart and multi-service checkout

`/cart` supports selecting eligible services, select all/deselect all, per-Seller grouping, an estimated subtotal, and visible warnings for unavailable records. Entries remain in the customer's existing account-scoped cart. An unavailable entry is not silently deleted. Self-booking and services without an eligible, real Seller Profile owner are rejected.

`/checkout?checkout=<opaque-id>` collects a requested date and brief for every selected service, validates all lines before mutation, and summarizes the selected Seller groups and estimated subtotal. Remote/asynchronous service lines also require a requested date in this multi-service flow. Submission creates one independent booking per service, including separate records for services from the same Seller. Sellers see only bookings for their owned Seller Profile; each Customer retains access only to their own records.

`submitCheckout(entries, { checkoutId, confirmed, expectedUserId })` validates the active session, selection, per-service details, availability and ownership. The optional `checkoutId` plus `checkoutServiceIds` tie the booking group together and allow retries to reuse previously persisted booking IDs. Repeated submission with the same account/context is idempotent. A changed selection or account is rejected. Since localStorage has no transactional or cross-tab compare-and-swap guarantee, a crash between writes can leave a partial group; retry can resume a verified partial group without duplicating saved rows. The UI reports persistence errors and does not claim database atomicity.

Single-service booking at `/booking/:serviceId` remains available. Legacy `/booking` redirects to `/orders`.

## Booking lifecycle and prices

The existing lifecycle remains `Requested → Accepted → Paid → Completed`, with `Declined` and `Cancelled` as terminal alternatives. Seller acceptance records a validated integer-Rupiah `finalPrice`; legacy accepted records can receive a one-time price only through the owning Seller action. The customer payment flow uses that exact accepted price. A Seller can complete work only after the record is Paid. Reviews remain restricted to valid, customer-owned Completed bookings.

New optional booking data:

- `checkoutId`: opaque checkout group identifier.
- `checkoutServiceIds`: selected service IDs recorded for retry-context validation.
- `finalPrice`: Seller-agreed integer Rupiah amount.
- `demoPayment`: simulation receipt `{ id, kind: "simulation", amount, paidAt }`.

These fields are validated when reading stored data. They do not replace existing booking identity, service, customer, Seller Profile, or lifecycle fields.

## Demo payment

`/payment/:bookingId` is available only for the authenticated Customer's Accepted booking and requires an explicit confirmation. `simulatePayment` rechecks ownership, status, exact accepted price, and current session before changing the shared booking record to Paid. It is enabled in Vite development or with `VITE_ENABLE_DEMO_PAYMENT=true`; this toggle only enables a clearly labeled local simulation. No card data, bank details, payment gateway, or money movement exists. This is not production payment authorization and must never be used as evidence of actual settlement.

For production, the backend must create payment intents and verify provider callbacks/webhooks server-side. Only a trusted backend event may mark a booking Paid. The server must enforce idempotency, amount/currency, booking ownership, replay protection, and reconciliation before enabling Paid → Completed.

## Notifications

The shared notification contract adds `booking_paid` for the explicitly simulated payment event. Existing `booking_requested`, `booking_accepted`, `booking_declined`, and `booking_completed` continue to use the shared store and deduplication by booking/event recipient. A payment event is emitted only when a booking has the validated `demoPayment` simulation marker. It does not prove real payment. Backend integration must define authoritative event IDs and deduplication semantics for these events.

## Password recovery

`/forgot-password` is informational and intentionally does not accept an email or expose account-existence information. There is no public browser reset API. The local utility in `dev/recover-account.js` is an offline development workflow: it consumes a chosen account-store backup and password/confirmation JSON via stdin, requires explicit target account ID/email and a confirmation flag, refuses Admin accounts, and writes a separate output file with restrictive permissions. It does not edit the running browser store or provide email delivery. Treat backups and stdin carefully; never commit them.

Production recovery requires a backend-issued, expiring, single-use recovery token or OTP, generic public responses, rate limits, audit events, and secure password hashing. Do not expose a privileged local recovery utility through a production route.

## Routes and permissions

`/checkout` and `/payment/:bookingId` require login and are protected by the existing account guard. Login return destinations remain restricted to supported internal routes, including nested Seller service availability paths; route permission checks still run after login. `/booking` redirects to `/orders`. Development-only Admin provisioning and Admin permission checks are unchanged; public registration cannot grant Admin permission.

## Backend integration contracts to update

The existing `frontend/docs/backend-handoff/` was not replaced. During backend integration, reconcile that handoff with these additions:

1. Multi-line checkout request/response and per-service booking representation; idempotency key and partial/retry semantics.
2. Optional `checkoutId`/service group fields or an equivalent server-side checkout relation.
3. Seller acceptance and final-price validation, including integer Rupiah/currency rules.
4. Server-owned payment intent and verified payment callback; frontend simulation receipts must not be accepted as proof.
5. `booking_paid` notification event and event ID/deduplication behavior.
6. Role/ownership checks on every Customer and Seller booking operation, including payment and completion.
7. Password recovery token/OTP endpoints and generic response policy.
8. Migration/compatibility validation for legacy bookings without checkout or final-price metadata.

## Demo testing

1. Register a normal Customer account. Activate a separate Seller account through Seller onboarding and publish eligible services.
2. Sign back in as Customer, add services from one or more Sellers, select multiple lines in `/cart`, and complete every date/brief field in `/checkout`.
3. Confirm each service creates its own Requested order. Sign in as the owning Seller, accept with a final price (or decline), and verify another Seller cannot see or mutate it.
4. As Customer, open the Accepted order and explicitly simulate payment. Confirm the same order becomes Paid, then as its Seller complete it. Submit a review as the Customer only after Completed.
5. Repeat checkout/payment actions to verify retry behavior and notification deduplication. Use separate accounts to check ownership boundaries.
6. Password recovery UI explains the development limitation. For a local offline recovery exercise, use a private backup and the explicit `node dev/recover-account.js ...` utility; do not use a live or shared account backup and never commit inputs/outputs.

Run `npm run lint`, `npm run build`, and `npm test` in this directory. Browser-local records are per browser profile and may be cleared by the user or browser storage policy.
# Digarsa Marketplace Frontend Handoff

Dokumen ini menjelaskan kondisi frontend saat ini untuk developer yang melanjutkan integrasi. Aplikasi masih memakai demo repository berbasis browser storage; data dan permission dari client bukan otorisasi production.

## 1. Struktur frontend

```text
frontend/
├── public/                 # favicon dan aset statis
├── src/
│   ├── assets/             # logo, hero, dan aset editorial
│   ├── components/         # komponen UI, layout, home, marketplace
│   ├── data/               # data marketplace dan sinkronisasi katalog
│   ├── features/
│   │   ├── account/        # AuthProvider, demo account store, guard, profile auth
│   │   ├── admin/          # dashboard, account list, order monitor, moderation
│   │   ├── catalog/        # katalog dan error/empty notices
│   │   ├── customer/       # dashboard, cart, booking, checkout, order tracking
│   │   ├── location/       # lokasi browser dan nearby search
│   │   ├── messaging/      # shared messaging foundation, UI, notifications
│   │   ├── profile/        # profil dan settings
│   │   ├── reviews/        # review store, dashboard, form, rating UI
│   │   ├── seller/         # Seller Center dan seller store
│   │   └── workspace/      # reusable workspace frame dan storage synchronization
│   ├── pages/              # home, marketplace detail, marketing, route shell
│   └── styles/             # tokens dan primitives global
├── tests/                  # Node test runner unit/integration tests
├── docs/                   # catatan stabilitas frontend
└── package.json
```

## 2. Teknologi dan perintah

- React `^19.3.1`, React DOM `^19.3.1`, React Router DOM `^7.18.5`.
- Vite `^8.3.6`, ESLint `^10.14.0`; Leaflet `^1.9.4` untuk peta.
- Instalasi dan jalankan dari folder `frontend`:

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

Port development ditentukan Vite. `npm run preview` menyajikan hasil build lokal.

## 3. Route map

### Publik

| Route | Tujuan |
| --- | --- |
| `/` | Beranda |
| `/marketplace` | Pencarian layanan |
| `/service/:id` | Detail layanan |
| `/seller/:id` | Profil publik Seller |
| `/nearby` | Pencarian layanan sekitar |
| `/about`, `/how-it-works` | Halaman informasi |
| `/login`, `/register`, `/reset-password` | Akun |

### Buyer / akun login (`RequireAccount`)

| Route | Tujuan |
| --- | --- |
| `/dashboard`, `/profile`, `/settings` | Dashboard dan pengaturan akun |
| `/favorites` (`/saved` alias) | Layanan tersimpan |
| `/cart`, `/checkout` | Pilihan layanan dan checkout beberapa layanan |
| `/booking` | Alias yang mengarahkan ke `/orders` |
| `/booking/:serviceId` | Form booking satu layanan |
| `/orders`, `/orders/:bookingId` | Daftar dan detail/status booking milik Buyer |
| `/orders/:bookingId/payment` | Simulasi pembayaran setelah booking diterima |
| `/reviews`, `/review/:bookingId` | Ringkasan dan form review |
| `/messages`, `/messages/:conversationId`, `/notifications` | Messaging dan notifications Buyer |

Route Seller dan Admin juga memerlukan login karena berada di dalam `RequireAccount`.

### Seller (`RequireSeller`, prefix `/seller-dashboard`)

`/seller-dashboard`, `/orders`, `/orders/:bookingId`, `/services`, `/services/new`, `/services/:serviceId/edit`, `/services/:serviceId/availability`, `/earnings`, `/profile`, `/messages`, `/messages/:conversationId`, `/notifications`.

### Admin (`RequireAdmin`, prefix `/admin`)

`/admin` (dashboard), `/admin/accounts`, `/admin/orders`, `/admin/moderation`.
Admin guard memerlukan permission `admin:access`; akun Buyer/Seller tanpa permission tersebut tetap ditolak.

## 4. Authentication dan role guard

`AuthProvider` memulihkan sesi dari `demoStore` dan menyediakan unified user context. Pendaftaran membuat akun Buyer. Seller adalah akun yang memiliki Seller Profile terhubung; Admin memerlukan permission `admin:access`. `RequireAccount`, `RequireSeller`, dan `RequireAdmin` melindungi route tanpa membuat sistem login terpisah.

Demo Admin lokal hanya untuk development melalui Vite loopback provisioner; izin ditambahkan untuk akun yang sudah terautentikasi setelah pemeriksaan ID. Tidak ada password atau token yang dicatat dalam dokumen ini. Ikuti petunjuk lokal di `src/features/account/README.md`; jangan gunakan mekanisme demo sebagai kontrol production. Login UI tidak menyediakan tautan “Setup Akun Admin”.

## 5. Alur produk

- **Booking:** Buyer mengirim permintaan setelah meninjau detail. Store memvalidasi ownership, ketersediaan, tanggal, delivery mode, self-booking, dan brief. Booking baru berstatus `Requested` dan payment `Unpaid`. Seller melihat booking yang terkait Seller Profile-nya, lalu dapat menerima atau menolak permintaan melalui shared customer booking store. Buyer Order Tracking membaca record yang sama.
- **Checkout:** Cart multi-pilih menghasilkan satu booking terpisah per layanan/Seller secara atomik; seller menerima tiap request secara independen. Harga checkout adalah estimasi awal.
- **Payment:** Halaman tersedia hanya setelah status booking `Accepted`. Pilihan transfer/QR, nomor rekening, serta tombol berhasil/gagal hanya simulasi lokal; tidak ada gateway, bukti transfer nyata, atau konfirmasi bank. Transisi `Paid` hanya berasal dari aksi simulasi lokal saat ini.
- **Messaging:** Buyer dan Seller memakai singleton `messagingStore` yang sama dan record Conversation/Message yang sama. Facade membatasi data menurut user aktif. Pesan membuat notification untuk recipient; read state dan unread count disimpan bersama.
- **Notifications:** Shared notification model mencakup pesan, booking, dan review. Event booking dideduplikasi; kegagalan notification tidak seharusnya membatalkan transisi booking.
- **Reviews:** Hanya booking `Completed` yang memenuhi syarat; satu verified review per booking. Rating tampil di marketplace, detail service, dan profil creator. Review baru memberi notifikasi Seller pemilik.

## 6. Stores dan browser persistence

Repository dibuat sebagai fungsi framework-independent dengan storage dependency injection; client singleton menyediakan `window.localStorage`. Beberapa hook mendengarkan perubahan lokal dan event `storage` agar tab lain menyegarkan data. Ini bukan transaksi lintas tab/server.

| Modul | localStorage key | Isi utama |
| --- | --- | --- |
| `account/demoStore.js` | `digarsa.demo.accounts.v1` | Akun, profil Buyer/Seller, permission dan sesi demo |
| `customer/customerStore.js` | `digarsa.demo.customer.v1` | Favorites, cart, booking, lifecycle dan status pembayaran demo |
| `seller/sellerStore.js` | `digarsa.demo.seller.v1` | Layanan Seller, availability, moderation flags |
| `messaging/contracts.js` | `digarsa.demo.messaging.v1` | Conversation, message, notification |
| `reviews/reviewStore.js` | `digarsa.demo.reviews.v1` | Review terverifikasi |
| `location/deviceLocationSession.js` | `digarsa.demo.nearby.location-attempted.v1` (sessionStorage) | Flag percobaan lokasi browser |

Browser storage dapat diedit oleh pemilik browser. Jangan mempercayai role, ownership, status, atau payment yang tersimpan di client untuk production.

## 7. Komponen reusable dan pola UI

- `components/ui/Button.jsx`, `Input.jsx` untuk kontrol dasar.
- `components/layout/PublicLayout.jsx`, `Navbar.jsx`, `Footer.jsx` untuk shell publik.
- `features/workspace/WorkspaceFrame.jsx` untuk dashboard ber-navigasi; dipakai oleh Seller/Admin/Customer frames.
- `features/customer/CustomerFrame.jsx`, `features/seller/SellerFrame.jsx`, `features/admin/AdminFrame.jsx` untuk shell role-specific.
- `features/customer/EmptyState.jsx`, status/formatters, serta komponen marketplace seperti `ServiceCard`, `Availability`, `Gallery`, `Reviews`.
- Shared style tokens ada di `src/styles/tokens.css`; primitives di `src/styles/primitives.css`.

Pertahankan pola route guard, facade store, empty/error states, dan token visual saat menambah fitur.

## 8. Fitur yang tersedia

- Marketplace, service detail, creator profile, filters, nearby search.
- Unified account, onboarding Seller, profile/settings, Buyer dashboard, favorites/cart.
- Booking request, lifecycle, order tracking, Seller incoming order actions.
- Seller dashboard, service CRUD, availability, profile, earnings estimate, messaging, notifications.
- Admin dashboard, account listing/detail read-only, order monitoring read-only, service moderation.
- Shared Buyer/Seller messaging dan notifications; review/rating terverifikasi.
- Multi-service checkout dan simulasi payment lokal.

## 9. Belum selesai, known issues, batasan

- Belum ada backend/API/database. Browser localStorage adalah demo persistence dan bukan security boundary.
- Tidak ada payment gateway/bank confirmation, transaksi keuangan, payout, atau bukti transfer nyata. Earnings adalah estimasi dari booking yang selesai, bukan saldo.
- Status booking/payment tidak dapat dipercaya sampai divalidasi server-side; tidak ada concurrency/locking lintas perangkat.
- Availability slots Seller merupakan data perencanaan dan belum menjadi time slot booking Buyer; booking saat ini menyimpan tanggal yang diminta.
- Admin account dan order views bersifat monitoring/read-only; moderation memiliki aksi yang tersedia di demo store. Pastikan keputusan produk sebelum memberi aksi admin yang mengubah order/account.
- Admin provisioning hanya workflow development localhost. Production memerlukan provisioning terkelola, session server, dan RBAC backend.
- Build berhasil namun Vite memberi peringatan bahwa bundle utama sekitar 513.6 kB melewati ambang 500 kB. Code splitting dapat direncanakan terpisah.
- Unit/integration test, lint, dan build tidak menggantikan pemeriksaan console dan end-to-end di browser untuk setiap role.

## 10. Backend integration checklist

1. Ganti adapter localStorage pada account/customer/seller/messaging/review stores dengan repository/API layer; pertahankan facade kontrak UI sejauh mungkin.
2. Implementasikan session/cookie aman dan authorization server-side untuk Buyer, Seller Profile, Admin permission, serta record-level ownership.
3. Buat transaksi atomik multi-booking atau alur idempotent untuk checkout; validasi harga, availability, status lifecycle, dan konkurensi di server.
4. Integrasikan payment provider dan webhook terverifikasi; jangan memetakan klik UI menjadi `Paid`.
5. Persist conversation/message/notification shared model, delivery/read state, dan sinkronisasi realtime/polling sesuai kebutuhan.
6. Simpan review dan moderasi di server; validasi completed booking dan satu review per booking pada server.
7. Tambahkan upload media terkelola untuk avatar dan service images, validasi file, serta URL/CDN.
8. Tambahkan observability, error mapping, pagination/filter server-side, migration/versioning, dan test API/contract.

Tidak ada endpoint backend yang diasumsikan atau didefinisikan di frontend.

## 11. Demo testing

- Buat Buyer melalui `/register` untuk memeriksa cart, booking, checkout, orders, messaging, dan review.
- Untuk Seller, gunakan akun unified lalu selesaikan onboarding `/become-a-creator`; hanya booking untuk Seller Profile terkait yang terlihat di Seller Center.
- Admin tidak dapat dibuat dengan mengganti email. Gunakan hanya localhost development provisioner yang sudah ada dan instruksi privat di `src/features/account/README.md`. Jangan masukkan credential ke Git atau handoff ini.
- Gunakan profil browser/origin demo terpisah bila ingin menghindari data localStorage lama. Test otomatis memakai storage fixture terisolasi.

## 12. QA snapshot

Pada pemeriksaan handoff ini: `npm test` lulus **209/209**, `npm run lint` lulus, dan `npm run build` lulus. Build mengeluarkan peringatan ukuran bundle yang disebut di atas. Pemeriksaan browser-console manual tidak dilakukan pada pass ini.

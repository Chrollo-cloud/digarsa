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
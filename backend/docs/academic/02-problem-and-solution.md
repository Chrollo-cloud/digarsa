# Identifikasi Masalah dan Solusi

## Identifikasi masalah

Berdasarkan ruang lingkup aplikasi yang tercermin dalam repository, DIGARSA diarahkan untuk mendukung:

1. Penemuan dan perbandingan layanan kreatif melalui katalog dan profil kreator.
2. Persiapan profil, portofolio, dan penawaran seller.
3. Pengelolaan booking, revisi, klarifikasi, serta proses penyelesaian layanan.
4. Pengawasan administratif atas aktivasi seller, moderasi, laporan, sengketa, dan banding.

Daftar tersebut adalah rumusan masalah produk, bukan temuan empiris. Tingkat kepentingan dan frekuensi tiap masalah pada pengguna belum diukur.

## Tujuan sistem

Tujuan implementasi adalah menyediakan aplikasi marketplace yang memiliki katalog layanan, pemisahan kemampuan customer/seller/admin, serta alur backend untuk pengelolaan layanan dan booking. Sistem juga mengandung mekanisme validasi dan pemeriksaan kepemilikan agar keputusan lifecycle dikelola server.

## Solusi yang ditawarkan

DIGARSA menggunakan frontend web React yang berkomunikasi dengan backend API Express. Backend menyimpan data domain pada PostgreSQL melalui Prisma dan menerapkan validasi, autentikasi, pemeriksaan peran/kemampuan, serta pemeriksaan kepemilikan pada route terkait. Cakupan integrasi tiap fitur berbeda dan sebagian antarmuka masih bersifat lokal/demo.

## Target pengguna dan manfaat yang diharapkan

| Pengguna | Dukungan sistem yang ditemukan | Manfaat yang diharapkan (belum diukur) |
|---|---|---|
| Customer | Katalog publik, profil kreator, favorites/cart, akun, dan sebagian alur booking. | Memudahkan penemuan dan pengelolaan pilihan layanan. |
| Seller | Profil, portofolio, pengajuan aktivasi, layanan, ketersediaan, dan aksi booking tertentu. | Membantu menyajikan layanan dan mengelola pesanan. |
| Admin | Review aktivasi, moderasi, laporan, bantuan revisi, sengketa, dan banding melalui backend. | Mendukung pengawasan proses dan pencatatan keputusan. |

Manfaat tersebut adalah tujuan desain, bukan hasil evaluasi pengguna atau dampak bisnis yang telah dibuktikan. Validasi kebutuhan, kepuasan, dan dampak: **[PERLU DATA DARI PEMILIK PROYEK]**.

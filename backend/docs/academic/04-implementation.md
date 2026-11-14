# Implementasi Sistem

## Frontend

Frontend menggunakan React, React Router, dan Vite. `AuthProvider` memulihkan sesi melalui API akun; `apiClient.js` menjadi transport bersama yang membaca `VITE_API_BASE_URL`. Integrasi API tersedia untuk autentikasi, katalog publik, creator profile, saved items, customer/seller profile preparation, seller service/availability, dan sebagian booking. Integrasi tidak merata: fitur tertentu masih local/demo atau belum tersedia sebagai alur frontend formal.

## Backend

Backend menggunakan Express dan TypeScript. `src/app.ts` mengatur middleware dan router; modul domain memuat route, controller, schema Zod, dan service. `src/server.ts` memulai listener dan memanggil scheduler startup guard. Endpoint terlindungi menggunakan JWT, pemeriksaan role/capability, dan kepemilikan resource.

## Database

PostgreSQL diakses melalui Prisma 7 dan adapter `pg`. `prisma/schema.prisma` mendefinisikan model dan constraint; riwayat migration berada di `prisma/migrations/`. Runtime membaca `DATABASE_URL`, sedangkan Prisma CLI membaca `DIRECT_URL` melalui konfigurasi Prisma. Koneksi menggunakan konfigurasi CA/TLS ketat sebagaimana diringkas dalam audit. Dokumen ini tidak menyertakan credential dan tidak menyatakan status database live.

## Autentikasi dan otorisasi

Kata sandi diverifikasi/dihash melalui bcryptjs; token JWT menggunakan HS256. Middleware memvalidasi token, memuat status user terkini, dan menolak token-version lama. Role database adalah `USER` dan `ADMIN`; seller capability ditentukan melalui profil dan status persetujuan. Controller/service memeriksa ownership. `logout-all` menaikkan token version sehingga mengakhiri seluruh sesi akun jika berhasil.

## Fitur utama dan batas integrasi

- Katalog memfilter layanan publik dengan status layanan, moderasi, kategori, dan seller yang sesuai.
- Seller activation review menggunakan snapshot profil, portofolio, dan penawaran serta bukan pemeriksaan identitas pemerintah.
- Booking, delivery cycle, revision, admin assistance, dispute, dan appeal memiliki representasi backend. Hasil source tidak otomatis berarti seluruh workflow telah diverifikasi melalui UI/live service.
- Payment route yang bernama demo tidak setara dengan gateway/QRIS tepercaya atau penyelesaian keuangan.

Teknologi dipilih sebagaimana dapat diamati pada package dan konfigurasi: React untuk UI komponen, Express untuk HTTP API, Prisma untuk akses data terstruktur, PostgreSQL sebagai penyimpanan relasional, serta JWT untuk autentikasi token. Alasan tersebut menjelaskan kesesuaian teknis secara umum; tidak ada hasil komparasi teknologi atau evaluasi performa yang diklaim.

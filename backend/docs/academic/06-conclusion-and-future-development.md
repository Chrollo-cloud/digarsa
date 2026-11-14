# Kesimpulan dan Pengembangan Selanjutnya

## Kesimpulan

DIGARSA telah memiliki fondasi aplikasi marketplace yang terdiri dari frontend React, backend Express/TypeScript, dan model PostgreSQL/Prisma. Source menyediakan katalog publik, akun, kemampuan seller, saved items, serta berbagai workflow booking dan administrasi. Sejumlah integrasi frontend-backend telah dilaksanakan, tetapi tidak seluruh fitur backend mempunyai antarmuka frontend yang terintegrasi atau bukti runtime lengkap.

Hasil pengujian yang tersedia menunjukkan tes fokus autentikasi/API dan pemeriksaan otorisasi historis lulus, sedangkan full suite frontend masih memiliki 49 kegagalan dari 286. Build frontend berhasil dengan peringatan ukuran bundle. Dengan bukti tersebut, sistem tidak dapat dinyatakan sepenuhnya lolos pengujian atau siap produksi.

## Keterbatasan

- Penyebab 49 kegagalan frontend belum seluruhnya dipastikan dan baseline sebelum perubahan tidak tersedia.
- Browser visual walkthrough belum diverifikasi menyeluruh.
- Runtime logout-all pada akun disposable dan booking/payment end-to-end belum diverifikasi menyeluruh.
- Integrasi frontend untuk beberapa fitur seperti messaging, review, notifikasi, sengketa/banding, dan administrasi masih terbatas atau local/demo.
- Payment gateway/QRIS, settlement, refund, payout, serta dampak bisnis terukur belum dibuktikan.
- Data latar belakang empiris dan validasi pengguna belum tersedia.

## Pengembangan selanjutnya

1. Triage dan perbaiki kegagalan test berdasarkan reproduksi serta bukti, tanpa menghapus test atau menganggapnya sebagai baseline lama.
2. Lengkapi browser walkthrough dan runtime lintas peran di environment yang disetujui.
3. Integrasikan UI untuk workflow backend yang memang menjadi prioritas produk, dengan kontrak dan otorisasi yang sudah ada.
4. Selesaikan rancangan dan pengujian pembayaran tepercaya secara terpisah sebelum mengklaim transaksi keuangan nyata.
5. Lakukan validasi kebutuhan/usability dengan metode yang disetujui dan catat hasil aktual.

## Data yang perlu dilengkapi pemilik proyek

- Identitas institusi, program, lokasi, periode, tim, dan pembimbing: **[PERLU DATA DARI PEMILIK PROYEK]**.
- Dasar empiris masalah (survei/wawancara/observasi/studi pustaka) dan jumlah responden jika ada: **[PERLU DATA DARI PEMILIK PROYEK]**.
- Hasil validasi kebutuhan, usability, kepuasan, dan kriteria keberhasilan: **[PERLU DATA DARI PEMILIK PROYEK]**.
- Data dampak bisnis/operasional setelah penggunaan, jika telah diukur: **[PERLU DATA DARI PEMILIK PROYEK]**.

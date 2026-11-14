# Hasil Pengujian

## Dasar pelaporan

Angka berikut merupakan hasil terbaru yang diberikan atau tercatat pada laporan proyek dan tidak dijalankan ulang saat penyusunan dokumen. Hasil harus dibaca sesuai jenis pengujiannya.

| Pengujian | Hasil tercatat | Interpretasi |
|---|---:|---|
| Tes fokus autentikasi/API frontend | 10 lulus | Pengujian terfokus dengan mock; bukan pengujian HTTP live. |
| Pemeriksaan otorisasi runtime | 27/27 lulus | Hasil runtime historis; tidak dijalankan ulang pada fase dokumentasi. |
| Seluruh test frontend | 237 lulus, 49 gagal, total 286 | Dua run terbaru dilaporkan konsisten. Tidak tersedia baseline pra-perubahan sehingga penyebab tidak boleh dianggap seluruhnya lama atau seluruhnya bug aplikasi. |
| ESLint pada file frontend yang diubah | Lulus | Cakupan lint terbatas pada file yang diubah. |
| Production build frontend | Lulus | Terdapat peringatan bundle minified melebihi 500 kB. |
| Browser visual walkthrough menyeluruh | Belum diverifikasi | Rendering lengkap, console, dan Network tidak diklaim lulus. |
| Runtime `logout-all` dengan akun disposable | Belum diuji | Implementasi sumber mencabut semua sesi, tetapi uji runtime khusus tidak tercatat. |
| Workflow booking/payment runtime menyeluruh | Belum diverifikasi | Tidak ada klaim alur end-to-end Supabase lengkap. |

## Keterbatasan

Sebanyak 49 kegagalan frontend masih belum diklasifikasikan hingga akar penyebab untuk seluruh kasus. Tidak ada baseline yang dapat membuktikan bahwa kegagalan tersebut sudah ada sebelumnya. Backend `npm test` dalam snapshot audit masih berupa placeholder yang berakhir dengan status gagal; pengujian backend terdahulu menggunakan perintah fokus tidak dijalankan ulang di sini.

Uji usability, validasi pengguna, kepuasan, serta ukuran keberhasilan sistem: **[PERLU DATA DARI PEMILIK PROYEK]**. Jangan menafsirkan hasil build atau unit test sebagai bukti keberhasilan bisnis.

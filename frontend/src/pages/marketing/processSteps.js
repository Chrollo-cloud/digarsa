// Public explanations of existing routes. No actions, permissions, or store writes.
export const processSteps = {
  customer: [
    {
      title: "Jelajahi kemungkinan.",
      copy: "Mulai dari marketplace. Lihat layanan dan kreator di berbagai bidang, dari branding sampai kebutuhan digital.",
      to: "/marketplace",
      link: "Jelajahi layanan",
    },
    {
      title: "Temukan yang sesuai.",
      copy: "Baca detail layanan, estimasi harga awal, cara pengerjaan, dan portofolio kreator. Perhatikan status Open atau Full-book sebelum menentukan pilihan.",
      to: "/marketplace",
      link: "Temukan kreator",
    },
    {
      title: "Ceritakan idemu.",
      copy: "Pada layanan yang bisa dipesan, masuk ke akunmu lalu kirim permintaan booking dengan brief yang jelas. Permintaan berstatus Requested dan menunggu keputusan kreator.",
      to: "/marketplace",
      link: "Pilih layanan untuk booking",
    },
    {
      title: "Samakan arah lewat percakapan.",
      copy: "Hubungi kreator yang memiliki akun aktif melalui Chat Kreator atau detail pesanan. Diskusikan ruang lingkup, jadwal, dan harapan proyek melalui Messaging.",
      to: "/messages",
      link: "Buka pesan",
    },
    {
      title: "Ikuti perjalanan pesanan.",
      copy: "Lihat keputusan kreator dan status booking di halaman Pesanan. Accepted berarti permintaan diterima; pembayaran belum tersedia dalam demo sehingga status ini tidak otomatis menjadi Paid atau Completed.",
      to: "/orders",
      link: "Lihat pesanan",
    },
    {
      title: "Bagikan pengalamanmu.",
      copy: "Ulasan hanya tersedia untuk booking milikmu yang benar-benar berstatus Completed. Beri rating dan ceritakan pengalaman kolaborasi untuk membantu pelanggan berikutnya.",
      to: "/reviews",
      link: "Buka ulasan saya",
    },
  ],
  creator: [
    {
      title: "Satu akun untuk mulai.",
      copy: "Daftar atau masuk ke akun Digarsa. Kamu tetap bisa menjelajahi dan memesan layanan sebagai pelanggan, termasuk setelah menjadi kreator.",
      to: "/register",
      link: "Buat akun Digarsa",
    },
    {
      title: "Aktifkan ruang kreatormu.",
      copy: "Pilih Jadi Kreator dan buat Seller Profile. Isi nama kreator atau studio, kategori, kota, dan bio agar pelanggan bisa mengenal keahlianmu.",
      to: "/become-a-creator",
      link: "Aktifkan Seller Profile",
    },
    {
      title: "Tunjukkan yang kamu tawarkan.",
      copy: "Lengkapi profil dan tautan portofolio, lalu publikasikan layanan dengan deskripsi, estimasi harga, serta cara pengerjaan yang jelas.",
      to: "/seller-dashboard/services",
      link: "Kelola layanan",
    },
    {
      title: "Tinjau setiap kesempatan.",
      copy: "Baca brief pada Pesanan Masuk. Terima atau tolak permintaan sesuai kemampuan dan ketersediaanmu. Pelanggan dapat melihat keputusan pada booking yang sama.",
      to: "/seller-dashboard/orders",
      link: "Lihat pesanan masuk",
    },
    {
      title: "Bangun pemahaman bersama.",
      copy: "Baca dan balas percakapan pelanggan di Seller Center. Sepakati detail pengerjaan lewat komunikasi yang jelas dan jaga informasi proyek tetap dalam konteks percakapannya.",
      to: "/seller-dashboard/messages",
      link: "Buka pesan seller",
    },
    {
      title: "Rawat ruang berkaryamu.",
      copy: "Kelola layanan, ketersediaan, pesanan, dan profil dari Seller Center. Angka pendapatan yang ditampilkan adalah estimasi dari harga awal booking, bukan pembayaran yang diterima.",
      to: "/seller-dashboard",
      link: "Buka Seller Center",
    },
  ],
};

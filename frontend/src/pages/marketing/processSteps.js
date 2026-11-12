// Public explanations of existing routes. No actions, permissions, or store writes.
export const processSteps = {
  customer: [
    {
      title: "Jelajahi kemungkinan.",
      copy: "Mulai of marketplace. Show services dan kreator di berbagai bidang, of branding sampai kebutuhan digital.",
      to: "/marketplace",
      link: "Jelajahi services",
    },
    {
      title: "Temukan yang sesuai.",
      copy: "Baca detail services, estimasi harga awal, cara pengerjaan, dan portofolio kreator. Perhatikan status Available atau Fully booked sebelum menentukan pilihan.",
      to: "/marketplace",
      link: "Find creators",
    },
    {
      title: "Ceritakan idemu.",
      copy: "Choose an available service, sign in, and submit a booking request with a clear brief. Your request starts as Requested and awaits the creator's decision.",
      to: "/marketplace",
      link: "Select a service untuk booking",
    },
    {
      title: "Samakan arah lewat percakapan.",
      copy: "Contact creator yang memiliki akun aktif melalui Chat with creator atau detail orders. Diskusikan ruang lingkup, jadwal, dan harapan proyek melalui Messaging.",
      to: "/messages",
      link: "Buka pesan",
    },
    {
      title: "Ikuti perjalanan orders.",
      copy: "Show keputusan kreator dan status booking di halaman Orders. Accepted berarti permintaan diterima; pembayaran belum tersedia dalam demo sehingga status ini tidak otomatis menjadi Paid atau Completed.",
      to: "/orders",
      link: "View orders",
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
      copy: "Sign up atau masuk ke akun Digarsa. Kamu tetap bisa menjelajahi dan memesan services sebagai pelanggan, termasuk setelah menjadi kreator.",
      to: "/register",
      link: "Create an account Digarsa",
    },
    {
      title: "Aktifkan ruang kreatormu.",
      copy: "Pilih Become a creator dan buat Seller Profile. Isi nama kreator atau studio, kategori, kota, dan bio agar pelanggan bisa mengenal keahlianmu.",
      to: "/become-a-creator",
      link: "Aktifkan Seller Profile",
    },
    {
      title: "Tunjukkan yang kamu tawarkan.",
      copy: "Lengkapi profil dan tautan portofolio, lalu publikasikan services dengan deskripsi, estimasi harga, serta cara pengerjaan yang jelas.",
      to: "/seller-dashboard/services",
      link: "Kelola services",
    },
    {
      title: "Review setiap kesempatan.",
      copy: "Review the brief in Orders. Accept or decline the request based on your capacity and availability. Customers can see your decision on the same booking.",
      to: "/seller-dashboard/orders",
      link: "View orders masuk",
    },
    {
      title: "Bangun pemahaman bersama.",
      copy: "Baca dan balas percakapan pelanggan di Seller Center. Sepakati detail pengerjaan lewat komunikasi yang jelas dan jaga informasi proyek tetap dalam konteks percakapannya.",
      to: "/seller-dashboard/messages",
      link: "Buka pesan seller",
    },
    {
      title: "Rawat ruang berkaryamu.",
      copy: "Manage services, availability, orders, and your profile in Seller Center. Earnings are estimates based on starting prices, not payments received.",
      to: "/seller-dashboard",
      link: "Buka Seller Center",
    },
  ],
};

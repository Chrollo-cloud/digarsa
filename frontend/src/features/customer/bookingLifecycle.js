export const bookingLifecycle = ["Requested", "Accepted", "Paid", "Completed"];
export function bookingStatusDescription(status) {
  return (
    {
      Requested:
        "Menunggu tinjauan kreator. Permintaan belum diterima dan belum ada pembayaran.",
      Accepted:
        "Permintaan diterima. Belum dibayar dan belum dapat ditandai selesai. Checkout belum tersedia; status tetap Accepted sampai ada pembayaran yang sah.",
      Paid: "Status Paid tercatat pada data booking. Hanya kreator pemilik pesanan yang dapat menandai pekerjaan selesai. Demo ini tidak menyediakan aksi pembayaran.",
      Completed:
        "Pekerjaan ditandai selesai pada data booking. Halaman ini tidak memproses pembayaran atau memverifikasi riwayat pembayaran lama.",
      Declined:
        "Permintaan ditolak oleh kreator. Alur booking berhenti; tidak ada pembayaran otomatis.",
      Cancelled:
        "Permintaan dibatalkan. Alur booking berhenti; tidak ada pembayaran otomatis.",
    }[status] || "Status booking tidak dikenal."
  );
}

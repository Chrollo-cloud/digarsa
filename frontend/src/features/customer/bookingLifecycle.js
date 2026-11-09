export const bookingLifecycle = ["Requested", "Accepted", "Paid", "Completed"];
export function bookingStatusDescription(status) {
  return (
    {
      Requested:
        "Menunggu tinjauan kreator. Permintaan belum diterima dan belum ada pembayaran.",
      Accepted:
        "Permintaan diterima. Belum dibayar dan belum dapat ditandai selesai. Pembayaran belum tersedia; status tetap diterima sampai ada konfirmasi pembayaran yang sah.",
      Paid: "Status sudah dibayar tercatat pada data pesanan. Hanya kreator pemilik pesanan yang dapat menandai pekerjaan selesai. Demo ini tidak menyediakan aksi pembayaran.",
      Completed:
        "Pekerjaan ditandai selesai pada data booking. Halaman ini tidak memproses pembayaran atau memverifikasi riwayat pembayaran lama.",
      Declined:
        "Permintaan ditolak oleh kreator. Alur booking berhenti; tidak ada pembayaran otomatis.",
      Cancelled:
        "Permintaan dibatalkan. Alur booking berhenti; tidak ada pembayaran otomatis.",
    }[status] || "Status booking tidak dikenal."
  );
}

export const bookingLabels = Object.freeze({
  Requested: "Menunggu Persetujuan", Accepted: "Diterima Seller", Paid: "Sudah Dibayar",
  Completed: "Selesai", Declined: "Ditolak Seller", Cancelled: "Dibatalkan",
});
export const bookingStatusLabel = (status) => bookingLabels[status] || "Status tidak dikenal";

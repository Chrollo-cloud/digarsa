export const bookingLifecycle = ["Requested", "Accepted", "Paid", "In Progress", "Completed"];
export function bookingStatusDescription(status) {
  return (
    {
      Requested:
        "Menunggu tinjauan kreator. Permintaan belum diterima dan belum ada pembayaran.",
      Accepted:
        "Permintaan diterima. Belum dibayar dan belum dapat ditandai selesai. Pada demo, gunakan simulasi pembayaran secara sengaja; status tetap diterima sampai simulasi tercatat. Produksi memerlukan konfirmasi backend yang sah.",
      Paid: "Status sudah dibayar tercatat pada data pesanan. Hanya kreator pemilik pesanan yang dapat menandai pekerjaan selesai. Pembayaran demo bukan transaksi nyata atau konfirmasi bank.",
      "In Progress": "Kreator sedang mengerjakan pesanan yang sudah dibayar.",
      Completed:
        "Seller menandai pekerjaan selesai. Kamu dapat memberikan review terverifikasi.",
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
  "In Progress": "Sedang Dikerjakan",
});
export const bookingStatusLabel = (status) => bookingLabels[status] || "Status tidak dikenal";

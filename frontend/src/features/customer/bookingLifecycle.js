export const bookingLifecycle = ["Requested", "Accepted", "Paid", "In Progress", "Completed"];
export function bookingStatusDescription(status) {
  return (
    {
      Requested:
        "Menunggu tinjauan kreator. Permintaan belum diterima dan belum ada pembayaran.",
      Accepted:
        "Seller menerima permintaan. Belum dibayar; status tetap Accepted sampai pembayaran berhasil. Kamu dapat membuka ringkasan pembayaran untuk melanjutkan.",
      Paid: "Pembayaran simulasi berhasil. Hanya kreator pemilik yang dapat memulai pengerjaan pesanan.",
      "In Progress": "Seller sedang mengerjakan pesanan.",
      Completed:
        "Seller menandai pekerjaan selesai. Kamu dapat memberikan review terverifikasi.",
      Declined:
        "Permintaan ditolak oleh kreator. Alur booking berhenti; tidak ada pembayaran otomatis.",
      Cancelled:
        "Permintaan dibatalkan. Alur booking berhenti; tidak ada pembayaran otomatis.",
    }[status] || "Status booking tidak dikenal."
  );
}

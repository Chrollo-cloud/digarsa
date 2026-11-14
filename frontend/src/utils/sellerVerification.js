const STORAGE_KEY = "digarsa_seller_verifications";

export const getSellerVerifications = () => {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
};

const saveVerifications = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// Dipanggil setelah Seller selesai mendaftar
export const submitSellerVerification = (seller) => {
  const data = getSellerVerifications();

  const newSeller = {
    ...seller,
    verificationId: `SELLER-${Date.now()}`,
    verificationStatus: "pending",
    rejectionReason: "",
    submittedAt: new Date().toISOString(),
  };

  data.push(newSeller);
  saveVerifications(data);

  return newSeller;
};

// Admin menyetujui Seller
export const approveSeller = (verificationId) => {
  const data = getSellerVerifications();

  const updated = data.map((seller) =>
    seller.verificationId === verificationId
      ? {
          ...seller,
          verificationStatus: "approved",
          rejectionReason: "",
          verifiedAt: new Date().toISOString(),
        }
      : seller
  );

  saveVerifications(updated);
};

// Admin menolak Seller
export const rejectSeller = (verificationId, reason) => {
  const data = getSellerVerifications();

  const updated = data.map((seller) =>
    seller.verificationId === verificationId
      ? {
          ...seller,
          verificationStatus: "rejected",
          rejectionReason: reason,
        }
      : seller
  );

  saveVerifications(updated);
};
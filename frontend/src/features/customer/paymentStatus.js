export const PAYMENT_STATUSES = ["Unpaid", "Pending", "Paid", "Failed", "Expired"];

export function paymentStatusOf(booking) {
  if (booking?.demoPayment?.kind === "simulation") {
    const status = booking.demoPayment.status || "Paid";
    return PAYMENT_STATUSES.includes(status) ? status : "Unpaid";
  }
  const legacy = booking?.paymentStatus;
  return PAYMENT_STATUSES.includes(legacy) ? legacy : "Unpaid";
}

const details = {
  Unpaid: { label: "Unpaid", tone: "muted", description: "No demo payment has been recorded." },
  Pending: { label: "Pending", tone: "pending", description: "Demo payment is awaiting review." },
  Paid: { label: "Paid (demo)", tone: "success", description: "The payment simulation succeeded. No money was transferred." },
  Failed: { label: "Failed", tone: "danger", description: "The payment simulation failed." },
  Expired: { label: "Expired", tone: "muted", description: "The payment simulation has expired." },
};

export function paymentStatusInfo(status) {
  return details[status] || details.Unpaid;
}

export function isValidPaymentStatus(status) {
  return PAYMENT_STATUSES.includes(status);
}

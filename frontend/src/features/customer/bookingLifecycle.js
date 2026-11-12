export const bookingLifecycle = ["Requested", "Accepted", "Paid", "Completed"];
export function bookingStatusDescription(status) {
  return ({
    Requested: "Waiting for the creator to review your request. It has not been accepted, and no payment has been made.",
    Accepted: "Your request was accepted. It is unpaid and cannot be marked complete yet. In this demo, run the payment simulation intentionally; the status changes only after it is recorded. Production requires trusted backend confirmation.",
    Paid: "Payment is recorded and the funds are held (escrow). The creator submits the work; you can accept it or request a revision. If you do not respond within 3 days after delivery, the order completes automatically. Demo payment is not a real transaction or bank confirmation.",
    Completed: "The work is accepted (or auto-completed after 3 days) and the escrow was released to the creator, minus Digarsa 5% commission. Demo only: no real money moves.",
    Declined: "The creator declined this request. The booking flow has stopped; no payment is made automatically.",
    Cancelled: "This request was cancelled. The booking flow has stopped; no payment is made automatically.",
  }[status] || "Unknown booking status.");
}
export const bookingLabels = Object.freeze({
  Requested: "Awaiting review", Accepted: "Accepted", Paid: "Paid (demo)",
  Completed: "Completed", Declined: "Declined", Cancelled: "Cancelled",
});
export const bookingStatusLabel = status => bookingLabels[status] || "Unknown status";

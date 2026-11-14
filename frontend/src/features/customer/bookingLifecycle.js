export const bookingLifecycle = ["Requested", "Accepted", "Paid", "Delivered", "Completed"];
export function bookingStatusDescription(status) {
  return ({
    Requested: "Waiting for the creator to review your request. It has not been accepted, and no payment has been made.",
    Accepted: "The seller accepted your request. Payment is not available in this integration yet.",
    Paid: "The server reports a paid booking. Payment details are read-only here.",
    Delivered: "The seller marked the work as delivered. Review the server status and use an available action below.",
    Completed: "The server marked this booking complete.",
    Declined: "The creator declined this request. The booking flow has stopped; no payment is made automatically.",
    Cancelled: "This request was cancelled. The booking flow has stopped; no payment is made automatically.",
  }[status] || "Unknown booking status.");
}
export const bookingLabels = Object.freeze({
  Requested: "Awaiting review", Accepted: "Accepted", Paid: "Paid",
  Delivered: "Delivered", Completed: "Completed", Declined: "Declined", Cancelled: "Cancelled",
});
export const bookingStatusLabel = status => bookingLabels[status] || (typeof status === "string" && status ? status : "Status unavailable");

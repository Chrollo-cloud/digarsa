export const bookingDate = (date) =>
  date
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
        new Date(`${date}T00:00:00`),
      )
    : "Jadwal fleksibel";

// This display helper never makes a booking accessible; the store still scopes reads.
export function customerDeclineReason(booking, currentUserId) {
  if (
    !currentUserId ||
    booking?.customerId !== currentUserId ||
    booking.status !== "Declined" ||
    typeof booking.declineReason !== "string"
  )
    return "";
  return booking.declineReason.trim();
}

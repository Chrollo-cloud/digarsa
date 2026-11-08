// Observe successful existing booking writes; never change bookings or payments.
// Only a live owning seller can emit the corresponding foundation event. Requested
// is emitted by the customer submission flow, which can report a delivery failure.
export function installBookingNotificationBridge({
  accounts,
  customers,
  messaging,
  onError = () => {},
}) {
  let ownerId = null;
  let previous = new Map();
  function snapshot() {
    const user = accounts.current();
    if (!user?.sellerProfileId)
      return { owner: user?.id ?? null, statuses: new Map() };
    const view = customers.sellerView();
    if (view.error) throw new Error(view.error);
    return {
      owner: user.id,
      statuses: new Map(view.bookings.map((row) => [row.id, row.status])),
    };
  }
  function reset() {
    try {
      const next = snapshot();
      ownerId = next.owner;
      previous = next.statuses;
    } catch (error) {
      ownerId = null;
      previous = new Map();
      onError(error);
    }
  }
  function changed() {
    try {
      const next = snapshot();
      const before = previous;
      previous = next.statuses;
      if (ownerId !== next.owner) {
        ownerId = next.owner;
        return;
      }
      for (const [id, status] of next.statuses) {
        if (
          before.has(id) &&
          before.get(id) !== status &&
          ["Accepted", "Declined", "Completed"].includes(status)
        ) {
          try {
            messaging.notifyBookingEvent(id);
          } catch (error) {
            onError(error);
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }
  reset();
  const stopBookings = customers.subscribe(changed);
  const stopAccounts = accounts.subscribe(reset);
  return () => {
    stopBookings();
    stopAccounts();
  };
}

export async function runAdditionalRevisionRequestAction({
  event,
  actionLock,
  bookingId,
  requestId,
  action,
  input,
  setPending,
  setError,
  setSuccess,
  resetInput,
  logout,
  formatError,
  refresh,
  actions,
}) {
  event?.preventDefault?.();
  if (!bookingId || !requestId || actionLock.current) return false;

  actionLock.current = true;
  setPending(true);
  setError("");
  setSuccess("");
  try {
    if (action === "OFFER") await actions.createOffer(bookingId, requestId, input);
    else if (action === "CLARIFY") await actions.requestClarification(bookingId, requestId, input.message || "");
    else if (action === "REJECT") await actions.rejectRequest(bookingId, requestId, input.message || "");
    else return false;

    resetInput(requestId);
    setSuccess(action === "OFFER" ? "Offer and price breakdown saved by the server. Payment is not available." : "Request response saved by the server.");
    await refresh();
    return true;
  } catch (failure) {
    if (failure?.status === 401) logout();
    setError(formatError(failure));
    return false;
  } finally {
    actionLock.current = false;
    setPending(false);
  }
}

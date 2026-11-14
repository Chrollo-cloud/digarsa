/** Starts the booking scheduler unless explicitly disabled by the process environment. */
export function startBookingSchedulerIfEnabled(
  setting: string | undefined,
  startScheduler: () => unknown,
): boolean {
  if (setting?.trim().toLowerCase() === "false") return false;
  startScheduler();
  return true;
}

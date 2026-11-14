
import "dotenv/config";
import app from "./app.js";
import { startBookingScheduler } from "./modules/bookings/booking.scheduler.js";
import { startBookingSchedulerIfEnabled } from "./lib/booking-scheduler-startup.js";

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  const schedulerStarted = startBookingSchedulerIfEnabled(
    process.env.BOOKING_SCHEDULER_ENABLED,
    startBookingScheduler,
  );
  if (!schedulerStarted) console.log("Booking scheduler disabled by process configuration.");
});

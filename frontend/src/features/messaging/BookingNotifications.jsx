import { useEffect } from "react";
import { demoStore } from "../account/demoStore";
import { customerStore } from "../customer/customerClient";
import { messagingStore } from "./messagingClient";
import { installBookingNotificationBridge } from "./bookingNotificationBridge";

export default function BookingNotifications() {
  useEffect(
    () =>
      installBookingNotificationBridge({
        accounts: demoStore,
        customers: customerStore,
        messaging: messagingStore,
        // Booking writes have already succeeded. Never report them as failed or roll
        // them back because a separate demo notification could not be saved.
        onError: () =>
          console.warn(
            "Demo booking notifications could not be saved or verified.",
          ),
      }),
    [],
  );
  return null;
}

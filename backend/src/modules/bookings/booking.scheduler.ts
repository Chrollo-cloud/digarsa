import { prisma } from "../../config/prisma.js";

const AUTO_COMPLETE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
let running = false;

export async function autoCompleteDeliveredBookings(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS);
    const candidates = await prisma.booking.findMany({
      where: {
        status: "DELIVERED",
        deliveredAt: { lte: cutoff },
        payment: { is: { status: "PAID", payoutStatus: "HELD" } },
      },
      select: { id: true, customerId: true, seller: { select: { userId: true } } },
      take: 100,
    });

    for (const booking of candidates) {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.booking.updateMany({
          where: { id: booking.id, status: "DELIVERED", deliveredAt: { lte: cutoff } },
          data: { status: "COMPLETED", completedAt: now },
        });
        if (changed.count !== 1) return;
        await tx.payment.updateMany({
          where: { bookingId: booking.id, status: "PAID", payoutStatus: "HELD" },
          data: { payoutStatus: "ELIGIBLE" },
        });
        await tx.bookingStatusEvent.create({ data: {
          bookingId: booking.id,
          fromStatus: "DELIVERED",
          toStatus: "COMPLETED",
          actorUserId: null,
          source: "SYSTEM_AUTO_COMPLETE",
          occurredAt: now,
        } });
        await tx.notification.createMany({ data: [
          { userId: booking.customerId, type: "BOOKING_UPDATE", title: "Pesanan selesai otomatis", body: "Pesanan dikonfirmasi selesai setelah tiga hari tanpa konfirmasi.", refId: booking.id },
          { userId: booking.seller.userId, type: "BOOKING_UPDATE", title: "Pesanan selesai", body: "Masa konfirmasi buyer telah berakhir. Dana memenuhi syarat untuk proses pencairan.", refId: booking.id },
        ] });
      });
    }
  } finally {
    running = false;
  }
}

export function startBookingScheduler() {
  const run = () => void autoCompleteDeliveredBookings().catch((error) => {
    console.error("[BOOKING_SCHEDULER_ERROR]", error instanceof Error ? error.message : "Unknown error");
  });
  run();
  return setInterval(run, 60_000);
}
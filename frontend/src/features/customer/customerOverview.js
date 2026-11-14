import { statuses } from "./customerStore.js";

export function customerOverview(bookings) {
  return {
    active: bookings.filter((row) => ["Requested", "Accepted", "Paid"].includes(row.status)).length,
    completed: bookings.filter((row) => row.status === "Completed").length,
    statuses: statuses.map((status) => ({ status, count: bookings.filter((row) => row.status === status).length })),
    recent: [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3),
  };
}

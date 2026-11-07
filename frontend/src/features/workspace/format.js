export const dateTime = (iso) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
    : "—";
};
export const dateOnly = (iso) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("id-ID", { dateStyle: "medium" })
    : "—";
};
export const monthLabel = (key) => {
  const date = new Date(`${key}-01T00:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("id-ID", { month: "long", year: "numeric" })
    : "Tanggal tidak diketahui";
};
export const statusClass = (status) =>
  `ws-status is-${String(status).toLowerCase()}`;

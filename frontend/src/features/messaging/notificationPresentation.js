// Presentation-only selectors; ownership is checked by customerMessaging first.
export function notificationItems(rows, { unreadOnly = false, limit } = {}) {
  const result = rows.filter((row) => !unreadOnly || !row.is_read)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return limit === undefined ? result : result.slice(0, limit);
}
export function unreadNotifications(rows) {
  return rows.filter((row) => !row.is_read).length;
}

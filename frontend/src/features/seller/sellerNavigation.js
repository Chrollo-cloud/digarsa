// Shared by the sidebar ancestor so Escape works from its toggle and its links.
export function handleSellerMenuEscape(event, open, close, toggle) {
  if (!open || event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  close();
  toggle?.focus();
}

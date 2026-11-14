export function cartBadge(view, userId) {
  if (!userId || view.error) return null;
  return new Set(view.cart).size;
}

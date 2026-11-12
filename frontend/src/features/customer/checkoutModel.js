// Selection is a UI draft; the existing customer store remains authoritative.
export function cartSelection(cart, selected, getRestriction) {
  return [...new Set(cart)].filter(id => selected.includes(id) && !getRestriction(id));
}
export function checkoutGroups(ids, catalog, people) {
  const groups = new Map();
  for (const id of ids) {
    const service = catalog.find(row => row.id === id);
    const creator = people.find(row => row.id === service?.creatorId);
    const key = service?.creatorId || `missing-${id}`;
    if (!groups.has(key)) groups.set(key, { id: key, creator, items: [] });
    groups.get(key).items.push({ id, service });
  }
  return [...groups.values()];
}
export function checkoutTotal(ids, catalog) {
  return ids.reduce((sum, id) => sum + (catalog.find(row => row.id === id)?.price || 0), 0);
}
export function checkoutDestination(ids, checkoutId) {
  const query = new URLSearchParams({ attempt: checkoutId });
  ids.forEach(id => query.append("service", id));
  return `/checkout?${query}`;
}
export function parseCheckout(query) {
  const ids = query.getAll("service");
  const checkoutId = query.get("attempt") || "";
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length ||
      ids.some(id => !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,199}$/.test(id)) ||
      !/^checkout-[a-zA-Z0-9-]{1,100}$/.test(checkoutId))
    throw new Error("Your checkout selection is invalid. Choose a service from your cart again.");
  return { ids, checkoutId };
}

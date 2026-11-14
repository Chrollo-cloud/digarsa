import { addSavedItem, listSavedItems, removeSavedItem } from "./savedItemsApi.js";

const COLLECTIONS = new Set(["favorites", "cart"]);
export const canAddServiceToCart = (service) => service?.bookable === true;
const emptyCollection = (status = "idle") => ({ items: [], total: 0, cursor: null, hasMore: false, status, error: null, refreshError: "", loadingMore: false });
const blankState = (userId = null, status = "idle") => ({
  userId,
  favorites: emptyCollection(status),
  cart: emptyCollection(status),
  pending: {},
});

export function createSavedItemsStore(api = { addSavedItem, listSavedItems, removeSavedItem }) {
  let state = blankState();
  let generation = 0;
  const listeners = new Set();
  const emptyViews = new Map();
  const notify = () => listeners.forEach((listener) => listener());
  const setState = (next) => { state = next; notify(); };
  const isCurrent = (userId, version) => state.userId === userId && generation === version;

  async function listAll(kind) {
    let page = await api.listSavedItems(kind, { limit: 100 });
    const items = [...page.items];
    const seenCursors = new Set();
    while (page.hasMore && page.nextCursor && !seenCursors.has(page.nextCursor)) {
      seenCursors.add(page.nextCursor);
      page = await api.listSavedItems(kind, { cursor: page.nextCursor, limit: 100 });
      for (const item of page.items) {
        if (!items.some((existing) => existing.serviceId === item.serviceId)) items.push(item);
      }
    }
    if (page.hasMore && (!page.nextCursor || seenCursors.has(page.nextCursor))) {
      throw new Error("The saved-items list could not advance to its next page. Refresh and try again.");
    }
    return { items, total: page.total, nextCursor: page.hasMore ? page.nextCursor : null, hasMore: page.hasMore };
  }

  async function refreshKind(kind, userId, version) {
    const page = await listAll(kind);
    if (!isCurrent(userId, version)) return;
    setState({ ...state, [kind]: { items: page.items, total: page.total, cursor: page.nextCursor, hasMore: page.hasMore, status: "ready", error: null, refreshError: "", loadingMore: false } });
  }

  async function refresh(userId = state.userId) {
    if (!userId || state.userId !== userId) return;
    const version = generation;
    setState({
      ...state,
      favorites: { ...state.favorites, status: "loading", error: null, refreshError: "" },
      cart: { ...state.cart, status: "loading", error: null, refreshError: "" },
    });
    const results = await Promise.allSettled([
      listAll("favorites"),
      listAll("cart"),
    ]);
    if (!isCurrent(userId, version)) return;
    const next = { ...state };
    for (const [index, kind] of ["favorites", "cart"].entries()) {
      const result = results[index];
      next[kind] = result.status === "fulfilled"
        ? { items: result.value.items, total: result.value.total, cursor: result.value.nextCursor, hasMore: result.value.hasMore, status: "ready", error: null, refreshError: "", loadingMore: false }
        : { ...next[kind], status: "error", error: result.reason, loadingMore: false };
    }
    setState(next);
  }

  async function loadMore(kind) {
    if (!COLLECTIONS.has(kind) || !state.userId) return;
    const current = state[kind];
    if (!current.hasMore || !current.cursor || current.loadingMore) return;
    const userId = state.userId;
    const version = generation;
    setState({ ...state, [kind]: { ...current, loadingMore: true, refreshError: "" } });
    try {
      await refreshKind(kind, userId, version);
    } catch (error) {
      if (isCurrent(userId, version)) setState({ ...state, [kind]: { ...state[kind], loadingMore: false, error, refreshError: error.message } });
    }
  }

  async function mutate(kind, operation, serviceId, service = null) {
    if (!COLLECTIONS.has(kind) || !state.userId) throw new Error("Sign in to save this service to your account.");
    const userId = state.userId;
    const version = generation;
    const key = `${kind}:${serviceId}`;
    if (state.pending[key]) return false;
    setState({ ...state, pending: { ...state.pending, [key]: true } });
    try {
      if (operation === "add") await api.addSavedItem(kind, serviceId);
      else await api.removeSavedItem(kind, serviceId);
      if (!isCurrent(userId, version)) return false;
      const current = state[kind];
      const items = current.items.filter((item) => item.serviceId !== serviceId);
      const nextItems = operation === "add"
        ? [{ serviceId, service, available: service?.bookable === true }, ...items]
        : items;
      const localCollection = {
        ...current,
        items: nextItems,
        error: null,
        total: operation === "add"
          ? (items.length !== current.items.length ? current.total : current.total + 1)
          : Math.max(0, current.total - (items.length !== current.items.length ? 1 : 0)),
        status: "ready",
      };
      setState({ ...state, [kind]: localCollection });
      try {
        await refreshKind(kind, userId, version);
      } catch (error) {
        if (isCurrent(userId, version)) setState({ ...state, [kind]: { ...state[kind], error, refreshError: `Saved on Digarsa, but the list could not be refreshed. ${error.message}` } });
      }
      return true;
    } catch (error) {
      if (isCurrent(userId, version)) setState({ ...state, [kind]: { ...state[kind], error } });
      throw error;
    } finally {
      if (isCurrent(userId, version) && state.pending[key]) {
        const pending = { ...state.pending };
        delete pending[key];
        setState({ ...state, pending });
      }
    }
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot() { return state; },
    view(userId) {
      if (userId && state.userId === userId) return state;
      const key = userId || "__anonymous__";
      if (!emptyViews.has(key)) emptyViews.set(key, blankState(userId || null, userId ? "loading" : "idle"));
      return emptyViews.get(key);
    },
    activate(userId) {
      if (state.userId === userId) return;
      generation += 1;
      setState(blankState(userId, userId ? "loading" : "idle"));
      if (userId) void refresh(userId);
    },
    refresh,
    loadMore,
    addFavorite(serviceId, service) { return mutate("favorites", "add", serviceId, service); },
    removeFavorite(serviceId) { return mutate("favorites", "remove", serviceId); },
    addToCart(serviceId, service) {
      if (!canAddServiceToCart(service)) throw new Error("This service is not currently available to add to cart.");
      return mutate("cart", "add", serviceId, service);
    },
    removeFromCart(serviceId) { return mutate("cart", "remove", serviceId); },
  };
}

export const savedItemsStore = createSavedItemsStore();


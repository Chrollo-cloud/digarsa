import { useCallback, useEffect, useState } from "react";
import { bookingErrorMessage, getBooking, listBookings } from "./bookingApi.js";

export function useBookingList(role, status, userId, logout) {
  const key = `${role}:${userId || ""}:${status || ""}`;
  const [state, setState] = useState({ key: "", items: [], nextCursor: null, hasMore: false, total: 0, status: "loading", error: "", loadingMore: false });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId) {
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    listBookings(role, { status: status || undefined, signal: controller.signal }).then((page) => {
      if (active) setState({ key, ...page, status: "ready", error: "", loadingMore: false });
    }).catch((error) => {
      if (!active || error?.name === "AbortError") return;
      if (error?.status === 401) logout();
      setState({ key, items: [], nextCursor: null, hasMore: false, total: 0, status: "error", error: bookingErrorMessage(error), loadingMore: false });
    });
    return () => { active = false; controller.abort(); };
  }, [role, status, userId, logout, reload, key]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const loadMore = useCallback(async () => {
    if (state.key !== key || !state.hasMore || !state.nextCursor || state.loadingMore) return;
    setState((current) => ({ ...current, loadingMore: true, error: "" }));
    try {
      const page = await listBookings(role, { status: status || undefined, cursor: state.nextCursor });
      setState((current) => current.key === key ? ({ ...page, key, items: [...current.items, ...page.items], status: "ready", error: "", loadingMore: false }) : current);
    } catch (error) {
      if (error?.status === 401) logout();
      setState((current) => current.key === key ? ({ ...current, loadingMore: false, error: bookingErrorMessage(error) }) : current);
    }
  }, [role, status, state.key, state.hasMore, state.nextCursor, state.loadingMore, logout, key]);
  const view = state.key === key ? state : { key, items: [], nextCursor: null, hasMore: false, total: 0, status: userId ? "loading" : "ready", error: "", loadingMore: false };
  return { ...view, refresh, loadMore };
}

export function useBookingDetail(role, id, userId, logout) {
  const key = `${role}:${userId || ""}:${id || ""}`;
  const [state, setState] = useState({ key: "", booking: null, status: "loading", error: "" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!userId || !id) return undefined;
    const controller = new AbortController();
    let active = true;
    getBooking(role, id, { signal: controller.signal }).then((booking) => {
      if (active) setState({ key, booking, status: "ready", error: "" });
    }).catch((error) => {
      if (!active || error?.name === "AbortError") return;
      if (error?.status === 401) logout();
      setState({ key, booking: null, status: "error", error: bookingErrorMessage(error) });
    });
    return () => { active = false; controller.abort(); };
  }, [role, id, userId, logout, reload, key]);
  return { ...(state.key === key ? state : { key, booking: null, status: id ? "loading" : "ready", error: "" }), refresh: () => setReload((value) => value + 1) };
}

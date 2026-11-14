import { useCallback, useEffect, useMemo, useState } from "react";
import { getCatalogFacets, getPublicCreator, getPublicService, listPublicServices } from "./catalogApi.js";

function useResource(key, loader) {
  const [state, setState] = useState({ key: "", status: "ready", data: null, error: "", statusCode: 0 });
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    let active = true;
    loader(key, { signal: controller.signal }).then((data) => {
      if (active) setState({ key, status: "ready", data, error: "", statusCode: 0 });
    }).catch((error) => {
      if (active && error?.name !== "AbortError") setState({ key, status: "error", data: null, error: error.message, statusCode: error.status || 0 });
    });
    return () => { active = false; controller.abort(); };
  }, [key, loader, retryCount]);
  const retry = useCallback(() => {
    setState({ key, status: "loading", data: null, error: "", statusCode: 0 });
    setRetryCount((count) => count + 1);
  }, [key]);
  return state.key === key ? { ...state, retry } : { key, status: key ? "loading" : "ready", data: null, error: "", statusCode: 0, retry };
}

export function usePublicServiceList(filters, enabled = true) {
  const { q, category, city, min, max, availability, sort } = filters;
  const stableFilters = useMemo(() => ({ q, category, city, min, max, availability, sort }), [
    q, category, city, min, max, availability, sort,
  ]);
  const key = useMemo(() => JSON.stringify(stableFilters), [stableFilters]);
  const [state, setState] = useState({ key: "", items: [], cursor: null, hasMore: false, total: 0, status: "loading", error: "", moreError: "", loadingMore: false });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    listPublicServices(stableFilters, { signal: controller.signal }).then((page) => {
      if (active) setState({ key, ...page, cursor: page.nextCursor, status: "ready", error: "", moreError: "", loadingMore: false });
    }).catch((error) => {
      if (active && error?.name !== "AbortError") setState((current) => ({ ...current, key, status: "error", error: error.message }));
    });
    return () => { active = false; controller.abort(); };
  }, [enabled, key, stableFilters, retryCount]);

  const loadMore = useCallback(async () => {
    if (!enabled || state.key !== key || state.loadingMore || !state.hasMore || !state.cursor) return;
    setState((current) => ({ ...current, loadingMore: true, moreError: "" }));
    try {
      const page = await listPublicServices({ ...stableFilters, cursor: state.cursor });
      setState((current) => current.key === key ? {
        ...current,
        items: [...current.items, ...page.items],
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        total: page.total,
        loadingMore: false,
      } : current);
    } catch (error) {
      setState((current) => current.key === key ? { ...current, loadingMore: false, moreError: error.message } : current);
    }
  }, [enabled, key, stableFilters, state.key, state.loadingMore, state.hasMore, state.cursor]);

  const retry = useCallback(() => {
    setState((current) => ({ ...current, key, items: [], cursor: null, hasMore: false, total: 0, status: "loading", error: "", moreError: "", loadingMore: false }));
    setRetryCount((count) => count + 1);
  }, [key]);
  return state.key === key ? { ...state, loadMore, retry } : { key, items: [], cursor: null, hasMore: false, total: 0, status: enabled ? "loading" : "idle", error: "", moreError: "", loadingMore: false, loadMore, retry };
}

export function usePublicCatalogFacets() {
  const resource = useResource("facets", getCatalogFacets);
  return { categories: resource.data?.categories || [], cities: resource.data?.cities || [], status: resource.status, error: resource.error, retry: resource.retry };
}

export function usePublicService(id) {
  return useResource(id, getPublicService);
}

export function usePublicCreator(id) {
  return useResource(id, getPublicCreator);
}

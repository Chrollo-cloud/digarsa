import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SellerServicesContext } from "./sellerServicesContext.js";
import {
  createSellerAvailability,
  createSellerService,
  deleteSellerAvailability,
  deleteSellerService,
  listSellerAvailability,
  listSellerServices,
  setSellerServiceActive,
  setSellerServiceAvailability,
  updateSellerAvailability,
  updateSellerService,
} from "./sellerServicesApi.js";

export function SellerServicesProvider({ userId, onUnauthorized, children }) {
  const [state, setState] = useState({ userId: null, services: [], status: "idle", error: "" });
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return [];
    const version = ++generation.current;
    setState((current) => ({ ...current, userId, status: "loading", error: "" }));
    try {
      const services = await listSellerServices();
      if (generation.current === version) setState({ userId, services, status: "ready", error: "" });
      return services;
    } catch (error) {
      if (generation.current === version) setState({ userId, services: [], status: "error", error: error.message || "Layanan seller tidak dapat dimuat." });
      if (error?.status === 401) onUnauthorized?.();
      throw error;
    }
  }, [userId, onUnauthorized]);

  useEffect(() => {
    const version = ++generation.current;
    if (!userId) return undefined;
    const controller = new AbortController();
    listSellerServices({ signal: controller.signal }).then((services) => {
      if (generation.current === version) setState({ userId, services, status: "ready", error: "" });
    }).catch((error) => {
      if (error?.name === "AbortError") return;
      if (generation.current === version) setState({ userId, services: [], status: "error", error: error.message || "Layanan seller tidak dapat dimuat." });
      if (error?.status === 401) onUnauthorized?.();
    });
    return () => {
      controller.abort();
      if (generation.current === version) generation.current += 1;
    };
  }, [userId, onUnauthorized]);

  const retry = useCallback(() => {
    return refresh();
  }, [refresh]);

  const withAuthorizationHandling = useCallback(async (action) => {
    try {
      return await action();
    } catch (error) {
      if (error?.status === 401) onUnauthorized?.();
      throw error;
    }
  }, [onUnauthorized]);

  const commitServices = useCallback((update) => {
    generation.current += 1;
    setState((current) => {
      if (current.userId !== null && current.userId !== userId) return current;
      const services = current.userId === userId ? current.services : [];
      return { userId, services: update(services), status: "ready", error: "" };
    });
  }, [userId]);

  const create = useCallback(async (input) => {
    const created = await withAuthorizationHandling(() => createSellerService(input));
    commitServices((services) => [created, ...services]);
    return created;
  }, [commitServices, withAuthorizationHandling]);

  const update = useCallback(async (id, input) => {
    const updated = await withAuthorizationHandling(() => updateSellerService(id, input));
    commitServices((services) => services.map((item) => item.id === id ? updated : item));
    return updated;
  }, [commitServices, withAuthorizationHandling]);

  const setActive = useCallback(async (id, active) => {
    const updated = await withAuthorizationHandling(() => setSellerServiceActive(id, active));
    commitServices((services) => services.map((item) => item.id === id ? updated : item));
    return updated;
  }, [commitServices, withAuthorizationHandling]);

  const setAvailability = useCallback(async (id, availability) => {
    const updated = await withAuthorizationHandling(() => setSellerServiceAvailability(id, availability));
    commitServices((services) => services.map((item) => item.id === id ? updated : item));
    return updated;
  }, [commitServices, withAuthorizationHandling]);

  const remove = useCallback(async (id) => {
    const result = await withAuthorizationHandling(() => deleteSellerService(id));
    commitServices((services) => services.filter((item) => item.id !== id));
    return result;
  }, [commitServices, withAuthorizationHandling]);

  const slotAction = useCallback((action) => (...args) => withAuthorizationHandling(() => action(...args)), [withAuthorizationHandling]);
  const value = useMemo(() => {
    const currentState = state.userId === userId ? state : {
      userId: userId || null,
      services: [],
      status: userId ? "loading" : "idle",
      error: "",
    };
    return {
      ...currentState,
      refresh: retry,
      create,
      update,
      setActive,
      setAvailability,
      remove,
      listAvailability: slotAction(listSellerAvailability),
      createAvailability: slotAction(createSellerAvailability),
      updateAvailability: slotAction(updateSellerAvailability),
      removeAvailability: slotAction(deleteSellerAvailability),
    };
  }, [state, userId, retry, create, update, setActive, setAvailability, remove, slotAction]);

  return <SellerServicesContext.Provider value={value}>{children}</SellerServicesContext.Provider>;
}

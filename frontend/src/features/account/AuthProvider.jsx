import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./authContext";
import { demoStore } from "./demoStore";
import { clearAccessToken, getAccessToken, setAccessToken } from "../../lib/authToken.js";
import { getCurrentAccount, loginAccount, registerAccount, updateCurrentAccount } from "./authApi.js";

function syncLegacyFeatureSession(user) {
  try { demoStore.syncBackendUser(user); } catch { /* Legacy demo storage is optional. */ }
}

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, storageError: "" });
  const requestVersion = useRef(0);
  const restore = useCallback(async (signal) => {
    const version = ++requestVersion.current;
    const token = getAccessToken();
    if (!token) {
      if (version === requestVersion.current) setState({ status: "unauthenticated", user: null, storageError: "" });
      return;
    }
    try {
      const user = await getCurrentAccount(signal);
      if (version === requestVersion.current) {
        syncLegacyFeatureSession(user);
        setState({ status: "authenticated", user, storageError: "" });
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (version !== requestVersion.current) return;
      if (error?.status === 401) {
        clearAccessToken();
        setState({ status: "unauthenticated", user: null, storageError: "" });
      } else {
        setState({ status: "unavailable", user: null, storageError: error.message });
      }
    }
  }, []);

  const authenticate = useCallback(async (request) => {
    const { user, accessToken } = await request;
    setAccessToken(accessToken);
    requestVersion.current += 1;
    syncLegacyFeatureSession(user);
    setState({ status: "authenticated", user, storageError: "" });
    return user;
  }, []);
  const login = useCallback((email, password) => authenticate(loginAccount(email, password)), [authenticate]);
  const register = useCallback((input) => authenticate(registerAccount(input)), [authenticate]);
  const logout = useCallback(() => {
    requestVersion.current += 1;
    clearAccessToken();
    try { demoStore.logout(); } catch { /* Legacy local data must not block browser logout. */ }
    setState({ status: "unauthenticated", user: null, storageError: "" });
  }, []);
  const acceptAccount = useCallback((user) => {
    syncLegacyFeatureSession(user);
    setState({ status: "authenticated", user, storageError: "" });
    return user;
  }, []);
  const refreshAccount = useCallback(async () => {
    const version = requestVersion.current;
    try {
      const user = await getCurrentAccount();
      if (version !== requestVersion.current) return user;
      return acceptAccount(user);
    } catch (error) {
      if (error?.status === 401 && version === requestVersion.current) logout();
      throw error;
    }
  }, [acceptAccount, logout]);
  const updateAccountProfile = useCallback(async (patch, { expectedUserId } = {}) => {
    if (!state.user || state.user.id !== expectedUserId) throw new Error("Your active Digarsa account changed. Reload the profile before saving.");
    const version = requestVersion.current;
    try {
      const user = await updateCurrentAccount(patch);
      if (version !== requestVersion.current || user.id !== expectedUserId) throw new Error("Your active Digarsa account changed. Reload the profile before saving.");
      return acceptAccount(user);
    } catch (error) {
      if (error?.status === 401 && version === requestVersion.current) logout();
      throw error;
    }
  }, [state.user, acceptAccount, logout]);
  const store = useMemo(() => ({ ...demoStore, login, register, logout }), [login, register, logout]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void restore(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [restore]);

  const retrySession = useCallback(() => {
    setState({ status: "loading", user: null, storageError: "" });
    return restore();
  }, [restore]);
  const value = useMemo(() => ({ ...state, store, login, register, logout, retrySession, refreshAccount, updateAccountProfile }), [state, store, login, register, logout, retrySession, refreshAccount, updateAccountProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

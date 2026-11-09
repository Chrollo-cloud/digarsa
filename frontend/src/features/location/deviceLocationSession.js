import { validateCoordinates } from "./locationModel.js";

export const LOCATION_ATTEMPT_KEY = "digarsa.demo.nearby.location-attempted.v1";

// Only /nearby attaches this controller. The persisted flag contains no coordinates;
// there is deliberately no account-write API here.
export function createDeviceLocationSession({
  getGeolocation,
  getPermissions = () => null,
  getFlagStorage = () => null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  defer = queueMicrotask,
}) {
  let state = { status: "idle", point: null, source: null, owner: null };
  let scope = null;
  let leases = 0;
  let generation = 0;
  let timer;
  let attempted = false;
  const listeners = new Set();

  function publish(patch) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  function cancel() {
    generation++;
    clearTimer(timer);
    timer = undefined;
  }
  function wasAttempted() {
    try {
      return attempted || getFlagStorage()?.getItem(LOCATION_ATTEMPT_KEY) === "1";
    } catch {
      return attempted;
    }
  }
  function rememberAttempt() {
    attempted = true;
    try {
      getFlagStorage()?.setItem(LOCATION_ATTEMPT_KEY, "1");
    } catch {
      // The RAM guard still prevents repeat prompts when storage is blocked.
    }
  }
  async function permission() {
    try {
      return (await getPermissions()?.query({ name: "geolocation" }))?.state || "unknown";
    } catch {
      return "unknown";
    }
  }

  async function request(gesture) {
    if (!leases || ["checking", "loading"].includes(state.status)) return;
    cancel();
    const ticket = generation;
    let geolocation;
    try {
      geolocation = getGeolocation();
    } catch {
      publish({ status: "unsupported" });
      return;
    }
    if (!geolocation?.getCurrentPosition) {
      publish({ status: "unsupported" });
      return;
    }
    const repeated = wasAttempted();
    publish({ status: "checking" });
    function finish(patch) {
      if (ticket === generation && leases) {
        cancel();
        publish(patch);
      }
    }
    // A native permission dialog can outlive Geolocation's own acquisition timeout.
    timer = setTimer(() => finish({ status: "timeout" }), 12000);
    // Explicit retries call Geolocation synchronously inside the user gesture.
    const access = gesture ? "unknown" : await permission();
    if (ticket !== generation || !leases) return;
    if (access === "denied") {
      rememberAttempt();
      finish({ status: "denied" });
      return;
    }
    if (!gesture && repeated && access !== "granted") {
      finish({ status: "gesture" });
      return;
    }
    rememberAttempt();
    publish({ status: "loading" });
    try {
      geolocation.getCurrentPosition(
        position => {
          try {
            finish({
              status: "ready",
              point: validateCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude }),
              source: "geolocation",
            });
          } catch {
            finish({ status: "unavailable" });
          }
        },
        async error => {
          if (ticket !== generation || !leases) return;
          if (error?.code === 1) {
            const after = await permission();
            finish({ status: !gesture && after !== "denied" ? "gesture" : "denied" });
          } else {
            finish({ status: error?.code === 3 ? "timeout" : "unavailable" });
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    } catch (error) {
      finish({
        status: !gesture && ["SecurityError", "NotAllowedError"].includes(error?.name)
          ? "gesture" : "unavailable",
      });
    }
  }

  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach(owner) {
      if (scope !== owner) {
        cancel();
        scope = owner;
        publish({ status: "idle", point: null, source: null, owner });
      }
      leases++;
      if (!state.point && state.status === "idle") void request(false);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        leases--;
        // StrictMode's immediate remount shares the in-flight one-shot request.
        defer(() => {
          if (!leases) {
            cancel();
            if (["checking", "loading"].includes(state.status)) publish({ status: "gesture" });
          }
        });
      };
    },
    retry: () => request(true),
    useManual(point) {
      const validated = validateCoordinates(point);
      cancel();
      publish({ status: "ready", point: validated, source: "manual" });
    },
    clear() {
      cancel();
      publish({ status: "cleared", point: null, source: null });
    },
  };
}

// Browser APIs are resolved lazily, only when Nearby attaches or the user retries.
export const deviceLocationSession = createDeviceLocationSession({
  getGeolocation: () => navigator.geolocation,
  getPermissions: () => navigator.permissions,
  getFlagStorage: () => window.sessionStorage,
});

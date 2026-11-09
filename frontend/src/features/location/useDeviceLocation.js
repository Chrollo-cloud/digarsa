import { useEffect, useSyncExternalStore } from "react";
import { deviceLocationSession } from "./deviceLocationSession";

export function useDeviceLocation(owner) {
  const state = useSyncExternalStore(
    deviceLocationSession.subscribe,
    deviceLocationSession.snapshot,
  );
  useEffect(() => deviceLocationSession.attach(owner), [owner]);
  return {
    ...state,
    // Do not expose the previous account's point before the attach effect runs.
    ...(state.owner !== owner ? { point: null, source: null, status: "idle" } : {}),
    controller: deviceLocationSession,
  };
}

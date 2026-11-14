import { useSyncExternalStore } from "react";
import { catalogStatus } from "../seller/catalogSync";

export function useCatalog() {
  return useSyncExternalStore(catalogStatus.subscribe, catalogStatus.snapshot);
}

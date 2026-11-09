import { demoStore } from "../features/account/demoStore.js";
import { createDemoAdminProvisioner } from "./demoAdminProvisioner.js";

// Explicit DevTools import only; not referenced by main.jsx or the production graph.
// Both Vite development mode and a loopback hostname are required at call time.
const tooling = createDemoAdminProvisioner({
  development: import.meta.env?.DEV === true,
  hostname: window.location.hostname,
  storage: window.localStorage,
  accounts: demoStore,
});
export const currentDemoAccount = tooling.currentAccount;
export const provisionDemoAdmin = tooling.provision;

export const revokeDemoAdmin = tooling.revoke;

import { demoStore } from "../features/account/demoStore";
import { sellerStore, applyCatalog } from "../features/seller/sellerClient";
import { assertLocalDevelopment, createDemoBookingSetup } from "./demoBookingSetup";
import { getBaseServices } from "../data/marketplace";
const status = document.querySelector("#status");
try {
  assertLocalDevelopment(import.meta.env.DEV, location.hostname);
  const setup = createDemoBookingSetup({ accounts: demoStore, services: sellerStore, storage: localStorage, editorialServiceIds: getBaseServices().map(service => service.id), enabled: () => import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) });
  const password = role => document.querySelector(`#${role}-password`).value;
  const run = action => async () => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = "Preparing local demo…";
    try { await action(); applyCatalog(); status.textContent = "Done. Open Digarsa in a new tab; this origin shares the active session."; }
    catch (error) { status.textContent = error.message; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  };
  document.querySelector("#random").onclick = () => {
    for (const role of ["buyer", "seller"]) document.querySelector(`#${role}-password`).value = crypto.randomUUID();
    status.textContent = "Test passwords are filled in on this page only. Do not reload before saving them somewhere safe.";
  };
  document.querySelector("#setup").onclick = run(() => setup.setup({ sellerPassword: password("seller"), buyerPassword: password("buyer"), enableEditorialSamples: document.querySelector("#editorial-samples").checked }));
  for (const role of ["buyer", "seller"]) document.querySelector(`#${role}`).onclick = run(() => setup.login(role, password(role)));
  document.querySelector("#reset").onclick = run(() => setup.reset(password("seller")));
} catch (error) { status.textContent = error.message; document.querySelectorAll("button").forEach(button => { button.disabled = true; }); }

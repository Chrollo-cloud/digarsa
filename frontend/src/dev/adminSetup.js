import { demoStore } from "../features/account/demoStore.js";
import { currentDemoAccount, provisionDemoAdmin, revokeDemoAdmin } from "./demoAdmin.js";

const status = document.querySelector("#status");
function identity() {
  const user = currentDemoAccount();
  if (user.email !== "srikandi@gmail.com")
    throw new Error("Log in with the dedicated demo account before changing permissions.");
  document.querySelector("#identity").textContent = `${user.name} · ${user.email} · ID: ${user.id}`;
  return user;
}
async function action(task) {
  try {
    status.textContent = "Processing…";
    await task();
  } catch (error) {
    status.textContent = error.message;
  }
}
async function authenticate(register) {
  const response = await fetch("/__demo/admin-credentials", { method: "POST", headers: { "X-Digarsa-Local-Setup": "1" }, cache: "no-store" });
  const input = await response.json();
  if (!response.ok) throw new Error(input.error);
  if (register) await demoStore.register({ name: "Srikandi", email: input.email, password: input.password });
  else await demoStore.login(input.email, input.password);
  input.password = "";
  identity();
  status.textContent = "Account verified. Check the identity, then enter the ID to grant or revoke permission.";
}
document.querySelector("#register").onclick = () => action(() => authenticate(true));
document.querySelector("#login").onclick = () => action(() => authenticate(false));
for (const [selector, apply] of [["#grant", provisionDemoAdmin], ["#revoke", revokeDemoAdmin]]) {
  document.querySelector(selector).onclick = () => action(() => {
    const user = identity();
    const expectedId = document.querySelector("#account-id").value.trim();
    if (expectedId !== user.id) throw new Error("The ID must match the verified demo account.");
    apply(expectedId);
    status.textContent = "Permission saved. Reload the app to refresh navigation, then open /admin to check access.";
  });
}

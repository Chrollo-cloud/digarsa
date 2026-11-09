import { demoStore } from "../features/account/demoStore.js";
import { currentDemoAccount, provisionDemoAdmin, revokeDemoAdmin } from "./demoAdmin.js";

const status = document.querySelector("#status");
function identity() {
  const user = currentDemoAccount();
  if (user.email !== "srikandi@gmail.com")
    throw new Error("Masuk dengan akun demo khusus yang diminta sebelum mengubah izin.");
  document.querySelector("#identity").textContent = `${user.name} · ${user.email} · ID: ${user.id}`;
  return user;
}
async function action(task) {
  try {
    status.textContent = "Memproses…";
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
  status.textContent = "Akun terverifikasi. Periksa identitas lalu ketik ID untuk mengaktifkan atau mencabut izin.";
}
document.querySelector("#register").onclick = () => action(() => authenticate(true));
document.querySelector("#login").onclick = () => action(() => authenticate(false));
for (const [selector, apply] of [["#grant", provisionDemoAdmin], ["#revoke", revokeDemoAdmin]]) {
  document.querySelector(selector).onclick = () => action(() => {
    const user = identity();
    const expectedId = document.querySelector("#account-id").value.trim();
    if (expectedId !== user.id) throw new Error("ID harus sama dengan akun demo yang terverifikasi.");
    apply(expectedId);
    status.textContent = "Izin tersimpan. Reload aplikasi untuk memuat ulang navigasi dan buka /admin untuk memeriksa akses.";
  });
}

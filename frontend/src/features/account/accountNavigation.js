import { matchPath } from "react-router-dom";
import { ADMIN_PERMISSION } from "./demoStore.js";

export const buyerLinks = [
  ["/dashboard", "Dashboard"],
  ["/profile", "Profil Saya"],
  ["/settings", "Pengaturan"],
  ["/favorites", "Favorit"],
  ["/cart", "Keranjang"],
  ["/orders", "Pesanan"],
  ["/reviews", "Beri Penilaian"],
  ["/messages", "Pesan Saya"],
  ["/notifications", "Notifikasi Saya"],
];

export function accountLinks(user) {
  if (!user) return [];
  const links = [...buyerLinks];
  if (user.permissions?.includes(ADMIN_PERMISSION))
    links.push(["/admin", "Admin Dashboard"]);
  return links;
}

// These patterns mirror App.jsx. Focus never determines the current destination.
export function accountLinkActive(to, pathname) {
  if (to === "/reviews")
    return !!matchPath("/reviews", pathname) || !!matchPath("/review/:bookingId", pathname);
  const nested = ["/orders", "/messages", "/admin"].includes(to);
  return !!matchPath({ path: to, end: !nested }, pathname);
}

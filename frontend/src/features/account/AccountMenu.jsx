import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./authContext";
import { ADMIN_PERMISSION } from "./demoStore";
import "./account-menu.css";

const buyerLinks = [
  ["/dashboard", "Dashboard"],
  ["/profile", "Profil Saya"],
  ["/settings", "Pengaturan"],
  ["/favorites", "Favorit"],
  ["/cart", "Pertimbangan"],
  ["/orders", "Pesanan"],
  ["/messages", "Pesan"],
];

export default function AccountMenu({ onNavigate }) {
  const { user, store } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef(null);
  const root = useRef(null);
  const menu = useRef(null);
  const navigate = useNavigate();
  const links = [...buyerLinks];
  if (user.sellerProfileId) links.push(["/seller-dashboard", "Seller Center"]);
  if (user.permissions.includes(ADMIN_PERMISSION))
    links.push(["/admin", "Admin Dashboard"]);
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector('[role="menuitem"]')?.focus();
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() {
    setOpen(false);
    onNavigate();
  }
  function keys(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const next = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      items[next].focus();
    }
  }
  function logout() {
    try {
      store.logout();
      close();
      navigate("/", { replace: true });
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="account-menu__trigger"
        aria-label={`Menu akun ${user.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-navigation"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{user.name}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          id="account-navigation"
          className="account-menu__panel"
          role="menu"
          aria-label="Navigasi akun"
          ref={menu}
          onKeyDown={keys}
        >
          {links.map(([to, label]) => (
            <Link key={to} to={to} role="menuitem" onClick={close}>
              {label}
              {["/messages", "/seller-dashboard", "/admin"].includes(to) && (
                <small>Segera hadir</small>
              )}
            </Link>
          ))}
          <button type="button" role="menuitem" onClick={logout}>
            Keluar ↗
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

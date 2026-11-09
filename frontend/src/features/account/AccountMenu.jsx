import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./authContext";
import { useMessaging } from "../messaging/useMessaging";
import { customerMessaging } from "../messaging/customerMessagingClient";
import { createMenuInteraction } from "./menuInteraction";
import { accountLinks, accountLinkActive } from "./accountNavigation";
import "./account-menu.css";

export default function AccountMenu({ onNavigate }) {
  const { user, store } = useAuth();
  const { data: counts, error: messagingError } = useMessaging(() =>
    customerMessaging.counts(),
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef(null);
  const root = useRef(null);
  const menu = useRef(null);
  const navigate = useNavigate();
  const interaction = useRef(null);
  const links = accountLinks(user);
  const { pathname } = useLocation();
  const keyboardOpening = useRef(false);
  useEffect(() => {
    if (!open) return undefined;
    if (keyboardOpening.current)
      menu.current?.querySelector('[role="menuitem"]')?.focus();
    const controller = createMenuInteraction({
      contains: (target) => !!target && !!root.current?.contains(target),
      dismiss: () => setOpen(false),
    });
    interaction.current = controller;
    const pointer = (event) => controller.pointerDown(event.target);
    const end = () => controller.pointerEnd();
    const escape = (event) => controller.escape(event, () => trigger.current?.focus());
    document.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    return () => {
      interaction.current = null;
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    };
  }, [open]);
  function close() {
    setOpen(false);
    onNavigate();
  }
  function keys(event) {
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
      onKeyDown={open ? keys : undefined}
      onBlur={(event) => {
        interaction.current?.blur(event.relatedTarget);
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
        onClick={(event) => {
          keyboardOpening.current = event.detail === 0;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            keyboardOpening.current = true;
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
        >
          <div className="account-menu__identity" role="presentation">
            <span className="account-menu__avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          {links.map(([to, label], index) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={close}
              aria-current={accountLinkActive(to, pathname) ? "page" : undefined}
              className={[3, 7, 9].includes(index) ? "account-menu__group" : undefined}
            >
              <MenuIcon index={to === "/admin" ? 10 : index} />
              <span className="account-menu__label">{label}</span>
              {to === "/messages" && counts?.messages > 0 && (
                <small aria-label={`${counts.messages} pesan belum dibaca`}>
                  {counts.messages}
                </small>
              )}
              {to === "/notifications" && counts?.notifications > 0 && (
                <small
                  aria-label={`${counts.notifications} notifikasi belum dibaca`}
                >
                  {counts.notifications}
                </small>
              )}
              {messagingError &&
                ["/messages", "/notifications"].includes(to) && (
                  <small>Data tidak tersedia</small>
                )}
            </Link>
          ))}
          <button type="button" role="menuitem" onClick={logout}>
            <MenuIcon index={11} />
            <span className="account-menu__label">Keluar</span>
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

function MenuIcon({ index }) {
  const paths = [
    "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3",
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
    "M12 21 3 12C-3 3 8-1 12 6c4-7 15-3 9 6Z",
    "M2 3h3l3 13h11l3-9H6 M9 21h1 M18 21h1",
    "M5 4h14v18H5z M9 2h6v5H9z M8 12h8 M8 16h8",
    "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
    "M3 4h18v13H9l-6 4Z M7 8h10 M7 12h7",
    "M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Z M10 21h4",
    "M3 9h18l-2-6H5Z M5 9v12h14V9 M9 21v-7h6v7",
    "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z",
    "M10 3H3v18h7 M8 12h14 M17 7l5 5-5 5",
  ];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d={paths[index] || paths[1]} />
    </svg>
  );
}

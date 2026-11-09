import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { publicNavigation } from "../../data/navigation";
import Button from "../ui/Button";
import logo from "../../assets/brand/digarsa-logo-trimmed.png";
import { useAuth } from "../../features/account/authContext";
import NotificationBell from "../../features/messaging/NotificationBell";
import CartLink from "./CartLink";
import AccountMenu from "../../features/account/AccountMenu";
import "./Navbar.css";

export default function Navbar() {
  const { user } = useAuth();
  const [openPath, setOpenPath] = useState(null);
  const { pathname } = useLocation();
  const isOpen = openPath === pathname;
  const header = useRef(null);
  const trigger = useRef(null);
  const close = () => setOpenPath(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    function onPointer(event) {
      if (!header.current?.contains(event.target)) setOpenPath(null);
    }
    function onKey(event) {
      if (event.key === "Escape") {
        setOpenPath(null);
        trigger.current?.focus();
      }
    }
    function onResize() {
      if (window.innerWidth > 900) setOpenPath(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen]);

  return (
    <header className="site-header" ref={header}>
      <nav className="container navbar" aria-label="Navigasi utama">
        <Link
          to="/"
          className="navbar__brand"
          onClick={close}
          aria-label="Digarsa, beranda"
        >
          <img
            src={logo}
            alt="Digarsa — Your Digital Creative Match"
            width="453"
            height="153"
          />
        </Link>
        <div className="navbar__utilities">
          {user && <NotificationBell key={`notifications-${user.id}-${pathname}`} onNavigate={close} />}
          <CartLink key={user?.id || "guest"} onNavigate={close} />
        </div>
        <button
          className="navbar__toggle"
          ref={trigger}
          type="button"
          aria-expanded={isOpen}
          aria-controls="public-navigation"
          aria-label={isOpen ? "Tutup navigasi" : "Buka navigasi"}
          onClick={() => setOpenPath(isOpen ? null : pathname)}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path
              d={isOpen ? "M6 6l12 12M18 6L6 18" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
        <div
          className={`navbar__menu${isOpen ? " is-open" : ""}`}
          id="public-navigation"
        >
          <div className="navbar__links">
            {publicNavigation.map(({ to, label }) => (
              <NavLink key={to} to={to} onClick={close}>
                {label}
              </NavLink>
            ))}
          </div>
          <div className="navbar__actions">
            <>
              {user ? (
                <>
                  <AccountMenu key={pathname} onNavigate={close} />
                </>
              ) : (
                <Link className="navbar__login" to="/login" onClick={close}>
                  Masuk
                </Link>
              )}
            </>
            <Button
              variant="aqua"
              className="navbar__cta"
              to={
                user?.sellerProfileId
                  ? "/seller-dashboard"
                  : "/become-a-creator"
              }
              onClick={close}
            >
              {user?.sellerProfileId ? "Seller Center" : "Jadi Kreator"}{" "}
              {!user?.sellerProfileId && <span aria-hidden="true">↗</span>}
            </Button>
          </div>
        </div>
      </nav>
    </header>
  );
}

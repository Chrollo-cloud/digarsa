import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { customerMessaging } from "./customerMessagingClient";
import { useMessaging } from "./useMessaging";
import { createMenuInteraction } from "../account/menuInteraction";
import { notificationItems, unreadNotifications } from "./notificationPresentation";
import "./notification-bell.css";

export default function NotificationBell({ onNavigate }) {
  const { data, error } = useMessaging(() => customerMessaging.listNotifications());
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [failure, setFailure] = useState("");
  const root = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const interaction = useRef(null);
  const keyboardOpening = useRef(false);
  const count = unreadNotifications(data || []);
  const rows = notificationItems(data || [], { unreadOnly, limit: 8 });
  useEffect(() => {
    if (!open) return undefined;
    if (keyboardOpening.current) panel.current?.querySelector("button, a")?.focus();
    const controller = createMenuInteraction({
      contains: (target) => !!target && !!root.current?.contains(target),
      dismiss: () => setOpen(false),
    });
    interaction.current = controller;
    const pointer = (event) => controller.pointerDown(event.target);
    const end = () => controller.pointerEnd();
    const escape = (event) => controller.escape(event, () => trigger.current?.focus());
    const resize = () => { if (window.innerWidth <= 760) setOpen(false); };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    window.addEventListener("resize", resize);
    return () => {
      interaction.current = null;
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  function visit() {
    setOpen(false);
    onNavigate();
  }
  function read(id) {
    try {
      customerMessaging.markNotificationRead(id);
      setFailure("");
      return true;
    } catch (error) {
      setFailure(error.message);
      return false;
    }
  }
  const icon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Z M10 21h4" /></svg>;
  return (
    <div className="notification-bell" ref={root}
      onBlur={(event) => interaction.current?.blur(event.relatedTarget)}>
      <Link to="/notifications" className="notification-bell__mobile" onClick={visit} aria-label={`My Notifications${count ? `, ${count} unread` : ""}`}>
        {icon}<span>My Notifications</span>{count > 0 && <small>{count}</small>}
      </Link>
      <button ref={trigger} className="notification-bell__trigger" type="button"
        aria-label={`My Notifications${count ? `, ${count} unread` : ""}`}
        aria-expanded={open} aria-haspopup="dialog" aria-controls="customer-notification-popover"
        onClick={(event) => { keyboardOpening.current = event.detail === 0; setOpen(!open); }}>
        {icon}{count > 0 && <small>{count}</small>}
      </button>
      {open && (
        <section className="notification-popover" id="customer-notification-popover" role="dialog"
          aria-labelledby="notification-popover-title" ref={panel}>
          <header>
            <div><h2 id="notification-popover-title">My Notifications</h2><p>{error ? "Notification data is unavailable." : `${count} unread`}</p></div>
            <button type="button" aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button>
          </header>
          <div className="notification-filters" role="group" aria-label="Filter notifications">
            <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button>
            <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread</button>
          </div>
          <div className="notification-popover__list" aria-live="polite">
            {(error || failure) && <p className="notification-feedback" role="alert">{error || failure}</p>}
            {!error && !rows.length && <p className="notification-feedback">{unreadOnly ? "All kabar sudah kamu baca." : "No new updates. Your collaboration activity will appear here."}</p>}
            {!error && rows.map((notice) => (
              <article key={notice.id} className={notice.is_read ? "" : "is-unread"}>
                <span className="notification-event" aria-hidden="true">{notice.type === "new_message" ? "" : "◷"}</span>
                <div>
                  <Link to={notice.to} onClick={(event) => { if (read(notice.id)) visit(); else event.preventDefault(); }}>
                    <strong>{notice.title}</strong>
                    <p>{notice.message}</p>
                  </Link>
                  <time dateTime={notice.created_at}>{new Date(notice.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
                  {!notice.is_read && <button type="button" aria-label={`Mark as read: ${notice.title}`} onClick={() => read(notice.id)}>Mark as read</button>}
                </div>
                {!notice.is_read && <span className="notification-unread-dot" aria-label="Unread" />}
              </article>
            ))}
          </div>
          <footer><Link to="/notifications" onClick={visit}>Show semua notifikasi </Link></footer>
        </section>
      )}
    </div>
  );
}

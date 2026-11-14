import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SellerFrame from "./SellerFrame.jsx";
import { sellerMessaging } from "./sellerMessagingClient.js";
import { useSellerNotifications } from "./useSellerNotifications.js";
import "./sellerNotifications.css";

const labels = {
  new_message: "Pesan baru",
  booking_requested: "Orders baru",
  new_review: "New review",
};

function formatTime(value) {
  const time = new Date(value);
  return Number.isFinite(time.getTime())
    ? time.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Time unavailable";
}

export default function SellerNotificationsPage() {
  const { notifications, unreadCount, error } = useSellerNotifications();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState("");

  function markRead(id) {
    try {
      sellerMessaging.markNotificationRead(id);
      setActionError("");
    } catch (failure) {
      setActionError(failure.message || "Notifications could not be updated.");
    }
  }

  function openNotice(notice) {
    markRead(notice.id);
    navigate(notice.to);
  }

  return (
    <SellerFrame
      title="Notifikasi Seller."
      description="Pesan dan aktivitas services yang ditujukan kepada Seller Profile-mu."
    >
      <section className="seller-notifications" aria-label="Notifikasi Seller">
        {actionError && <div className="ws-alert" role="alert">{actionError}</div>}
        <header className="seller-notifications-heading">
          <div>
            <span className="ws-kicker">AKTIVITAS AKUN</span>
            <h2>Latest for you.</h2>
          </div>
          <span className="seller-notifications-count">
            {unreadCount} unread
          </span>
        </header>
        {error ? (
          <div className="ws-alert" role="alert">Notifications could not be loaded: {error}</div>
        ) : !notifications.length ? (
          <div className="ws-empty seller-notifications-empty">
            <span aria-hidden="true">✳</span>
            <h2>No notifications yet.</h2>
            <p>Pesan Customer dan booking servicesmu akan tampil di sini.</p>
          </div>
        ) : (
          <ul className="seller-notifications-list">
            {notifications.map((notice) => (
              <li key={notice.id} className={notice.is_read ? "is-read" : "is-unread"}>
                <span className="seller-notifications-mark" aria-hidden="true">✳</span>
                <div className="seller-notifications-copy">
                  <div className="seller-notifications-top">
                    <strong>{notice.title || labels[notice.type] || "Aktivitas baru"}</strong>
                    {!notice.is_read && <span className="seller-notifications-unread">Baru</span>}
                  </div>
                  <p>{notice.message}</p>
                  <time dateTime={notice.created_at}>{formatTime(notice.created_at)}</time>
                  <div className="seller-notifications-actions">
                    <button type="button" onClick={() => openNotice(notice)}>
                      {notice.type === "new_message" ? "Open conversation" : notice.type === "booking_requested" ? "View orders" : "View profile"}
                    </button>
                    {!notice.is_read && (
                      <button type="button" onClick={() => markRead(notice.id)}>
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="seller-notifications-footnote">
          <Link to="/seller-dashboard">Back to Seller overview</Link>
        </p>
      </section>
    </SellerFrame>
  );
}

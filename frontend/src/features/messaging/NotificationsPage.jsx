import { useState } from "react";
import { Link } from "react-router-dom";
import { customerMessaging } from "./customerMessagingClient";
import { useMessaging } from "./useMessaging";
import MessagingFrame from "./MessagingFrame";
import MessagingState from "./MessagingState";
import { notificationItems, unreadNotifications } from "./notificationPresentation";
import "./notification-bell.css";

export default function NotificationsPage() {
  const { data, error } = useMessaging(() =>
    customerMessaging.listNotifications(),
  );
  const [failure, setFailure] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const rows = notificationItems(data || [], { unreadOnly });
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
  return (
    <MessagingFrame title="My Notifications">
      <div className="customer-notification-summary">
        <p>{error ? "Notification data is unavailable." : `${unreadNotifications(data || [])} unread`}</p>
        <div className="notification-filters" role="group" aria-label="Filter notifications">
          <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread</button>
        </div>
      </div>
      {failure && (
        <p className="messaging-error" role="alert">
          {failure}
        </p>
      )}
      {error ? (
        <MessagingState error={error} />
      ) : !rows.length ? (
        <MessagingState title={unreadOnly ? "All kabar sudah kamu baca." : "No notifications yet."}>
          Kabar pesan dan perkembangan booking akan muncul di sini.
        </MessagingState>
      ) : (
        <div className="messaging-list" aria-label="Notifications">
          {rows.map((notice) => (
            <article
              className={`messaging-notification ${notice.is_read ? "" : "is-unread"}`}
              key={notice.id}
            >
              <span
                className="messaging-notification-dot"
                aria-label={notice.is_read ? "Read" : "Unread"}
              />
              <div>
                <h2>{notice.title}</h2>
                <p>{notice.message}</p>
                <time dateTime={notice.created_at}>
                  {new Date(notice.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
                <div className="messaging-notification-actions">
                  {notice.to ? (
                    <Link to={notice.to} onClick={() => read(notice.id)}>
                      Show{" "}
                      {notice.type === "new_message" ? "pesan" : "booking"}
                    </Link>
                  ) : (
                    <small>
                      Tidak ada tujuan di ruang pelanggan untuk notifikasi ini.
                    </small>
                  )}
                  {!notice.is_read && (
                    <button
                      type="button"
                      onClick={(event) => {
                        if (!read(notice.id)) event.preventDefault();
                      }}
                      aria-label={`Mark as read: ${notice.title}`}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </MessagingFrame>
  );
}

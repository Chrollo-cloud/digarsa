import { useState } from "react";
import { Link } from "react-router-dom";
import { customerMessaging } from "./customerMessagingClient";
import { useMessaging } from "./useMessaging";
import MessagingFrame from "./MessagingFrame";
import MessagingState from "./MessagingState";

export default function NotificationsPage() {
  const { data, error } = useMessaging(() =>
    customerMessaging.listNotifications(),
  );
  const [failure, setFailure] = useState("");
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
    <MessagingFrame title="Kabar untukmu">
      {failure && (
        <p className="messaging-error" role="alert">
          {failure}
        </p>
      )}
      {error ? (
        <MessagingState error={error} />
      ) : !data?.length ? (
        <MessagingState title="Belum ada notifikasi.">
          Kabar pesan dan perkembangan booking akan muncul di sini.
        </MessagingState>
      ) : (
        <div className="messaging-list" aria-label="Daftar notifikasi">
          {data.map((notice) => (
            <article
              className={`messaging-notification ${notice.is_read ? "" : "is-unread"}`}
              key={notice.id}
            >
              <span
                className="messaging-notification-dot"
                aria-label={notice.is_read ? "Sudah dibaca" : "Belum dibaca"}
              />
              <div>
                <h2>{notice.title}</h2>
                <p>{notice.message}</p>
                <time dateTime={notice.created_at}>
                  {new Date(notice.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
                <div className="messaging-notification-actions">
                  {notice.to ? (
                    <Link to={notice.to} onClick={() => read(notice.id)}>
                      Lihat{" "}
                      {notice.type === "new_message" ? "pesan" : "booking"} ↗
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
                      aria-label={`Tandai dibaca: ${notice.title}`}
                    >
                      Tandai dibaca
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

import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, NavLink } from "react-router-dom";
import { customerMessaging } from "./customerMessagingClient";
import { useMessaging } from "./useMessaging";
import ConversationThread from "./ConversationThread";
import "./messaging.css";
import "./workspace.css";

const viewportHeight = () =>
  window.visualViewport?.height ?? window.innerHeight;
function subscribeViewport(listener) {
  window.visualViewport?.addEventListener("resize", listener);
  window.addEventListener("resize", listener);
  return () => {
    window.visualViewport?.removeEventListener("resize", listener);
    window.removeEventListener("resize", listener);
  };
}

function Avatar({ conversation }) {
  return conversation.seller_image ? (
    <img className="workspace-avatar" src={conversation.seller_image} alt="" />
  ) : (
    <span className="workspace-avatar" aria-hidden="true">
      {conversation.seller_name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function InboxPanel({ conversations, error, activeId }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("id-ID");
  const rows = conversations.filter((row) =>
    [row.seller_name, row.service_title, row.last_message?.content || ""].some(
      (value) => value.toLocaleLowerCase("id-ID").includes(term),
    ),
  );
  const unread = conversations.reduce((sum, row) => sum + row.unread_count, 0);
  return (
    <aside className="workspace-inbox" aria-label="Inbox pelanggan">
      <header className="workspace-inbox-heading">
        <div>
          <span className="workspace-eyebrow">RUANG KOLABORASI</span>
          <h1>
            Pesan Saya<span>.</span>
          </h1>
        </div>
        {unread > 0 && (
          <span
            className="workspace-unread-total"
            aria-label={`${unread} pesan belum dibaca`}
          >
            {unread}
          </span>
        )}
      </header>
      <div className="workspace-search-wrap">
        <label className="workspace-search">
          <svg
            aria-hidden="true"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <span className="workspace-sr-only">Cari percakapan</span>
          <input
            type="search"
            placeholder="Cari percakapan…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <p className="workspace-list-caption" aria-live="polite">
          {error
            ? "Data percakapan belum tersedia"
            : term
              ? `${rows.length} hasil pencarian`
              : `${conversations.length} percakapan · terbaru di atas`}
        </p>
      </div>
      <div className="workspace-conversations">
        {error ? (
          <div className="workspace-list-state" role="alert">
            <strong>Inbox belum bisa dibuka.</strong>
            <p>{error}</p>
          </div>
        ) : !conversations.length ? (
          <div className="workspace-list-state">
            <span aria-hidden="true">↗</span>
            <strong>Ruang untuk ide berikutnya.</strong>
            <p>Temukan kreator, lalu mulai percakapan dari halaman layanan.</p>
            <Link to="/marketplace">Temukan kreator ↗</Link>
          </div>
        ) : !rows.length ? (
          <div className="workspace-list-state">
            <strong>Percakapan tidak ditemukan.</strong>
            <p>Coba nama kreator, layanan, atau kata lain.</p>
            <button type="button" onClick={() => setSearch("")}>
              Hapus pencarian
            </button>
          </div>
        ) : (
          <nav aria-label="Daftar percakapan">
            {rows.map((row) => (
              <NavLink
                className={`workspace-conversation ${row.id === activeId ? "is-active" : ""}`}
                key={row.id}
                to={`/messages/${row.id}`}
              >
                <Avatar conversation={row} />
                <div className="workspace-conversation-copy">
                  <div className="workspace-conversation-top">
                    <strong>{row.seller_name}</strong>
                    <time dateTime={row.updated_at}>
                      {new Date(row.updated_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  </div>
                  <span className="workspace-service-label">
                    {row.service_title}
                  </span>
                  <div className="workspace-conversation-preview">
                    <p>
                      {row.last_message?.content ||
                        "Sapa kreator dan bagikan idemu…"}
                    </p>
                    {row.unread_count > 0 && (
                      <span
                        className="workspace-unread"
                        aria-label={`${row.unread_count} pesan belum dibaca`}
                      >
                        {row.unread_count}
                      </span>
                    )}
                  </div>
                  <small className="workspace-context-label">
                    {row.booking_id ? "BOOKING" : "DISKUSI LAYANAN"}
                  </small>
                </div>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      <footer className="workspace-inbox-footer">
        <span aria-hidden="true">◈</span>
        <span>Ide baik bertemu orang yang tepat.</span>
      </footer>
    </aside>
  );
}

export default function MessagingWorkspace({ activeId }) {
  const visibleHeight = useSyncExternalStore(subscribeViewport, viewportHeight);
  const { user, data, error } = useMessaging(() =>
    customerMessaging.listInbox(),
  );
  useEffect(() => {
    document.title = `${activeId ? "Percakapan" : "Pesan Saya"} — Digarsa`;
  }, [activeId]);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return (
    <div
      className={`workspace-page ${activeId ? "has-conversation" : ""}`}
      style={{ "--workspace-viewport": `${visibleHeight}px` }}
    >
      <div className="workspace-shell">
        <header className="workspace-topline">
          <div>
            <span className="workspace-eyebrow">DIGARSA / RUANG PERSONAL</span>
            <p>Setiap karya dimulai dari percakapan.</p>
          </div>
        </header>
        <div className="workspace-panels">
          <InboxPanel
            key={user.id}
            conversations={data || []}
            error={error}
            activeId={activeId}
          />
          <div className="workspace-chat-panel">
            {activeId ? (
              <ConversationThread
                key={`${user.id}-${activeId}`}
                id={activeId}
              />
            ) : (
              <section
                className="workspace-welcome"
                aria-label="Pilih percakapan"
              >
                <span className="workspace-welcome-art" aria-hidden="true">
                  <svg
                    width="58"
                    height="58"
                    viewBox="0 0 64 64"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  >
                    <path d="M12 14h40v29H29L15 53V43h-3z" />
                    <path d="M22 25h20M22 32h13" />
                  </svg>
                  <span>✳</span>
                </span>
                <span className="workspace-eyebrow">
                  WHERE IDEAS MEET TALENT.
                </span>
                <h2>
                  Obrolan kecil.
                  <br />
                  Kemungkinan besar<span>.</span>
                </h2>
                <p>
                  Pilih percakapan untuk melanjutkan ide,
                  <br />
                  menyusun brief, dan memulai karya bersama.
                </p>
                <Link to="/marketplace">Temukan kolaborasi berikutnya ↗</Link>
              </section>
            )}
          </div>
        </div>
        <p className="workspace-demo">
          Demo lokal · Percakapan tersimpan di browser ini, tanpa sinkronisasi
          lintas perangkat.
        </p>
      </div>
    </div>
  );
}

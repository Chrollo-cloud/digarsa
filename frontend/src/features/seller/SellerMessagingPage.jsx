import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { messageSafety } from "../messaging/contracts.js";
import { Empty } from "../workspace/WorkspaceFrame.jsx";
import SellerFrame from "./SellerFrame.jsx";
import { sellerMessaging } from "./sellerMessagingClient.js";
import { useSellerMessaging } from "./useSellerMessaging.js";
import "./sellerMessaging.css";

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("en-US") || "")
    .join("") || "C";
}

function Avatar({ name, src }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img className="seller-message-avatar" src={src} alt="" onError={() => setFailed(true)} />
  ) : (
    <span className="seller-message-avatar is-initial" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function formatTime(value, includeDate = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay && !includeDate
    ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("en-US", {
        dateStyle: "medium",
        ...(includeDate ? { timeStyle: "short" } : {}),
      });
}

function Inbox({ inbox, activeId, error }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("en-US");
  const rows = inbox.filter((row) =>
    row.customer_name.toLocaleLowerCase("en-US").includes(query),
  );
  const unread = inbox.reduce((count, row) => count + row.unread_count, 0);
  return (
    <aside className="seller-message-inbox" aria-label="Inbox Customer">
      <header className="seller-message-inbox-header">
        <div>
          <span className="seller-message-eyebrow">DIGARSA / SELLER CENTER</span>
          <h2>Pesan<span>.</span></h2>
        </div>
        {unread > 0 && (
          <span className="seller-message-total-unread" aria-label={`${unread} pesan unread`}>
            {unread}
          </span>
        )}
      </header>
      <label className="seller-message-search">
        <span className="seller-message-sr-only">Search nama Customer</span>
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          placeholder="Search nama Customer…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <p className="seller-message-caption" aria-live="polite">
        {error
          ? "Inbox belum tersedia"
          : query
            ? `${rows.length} hasil pencarian`
            : `${inbox.length} percakapan · terbaru di atas`}
      </p>
      <div className="seller-message-list">
        {error ? (
          <div className="seller-message-list-state" role="alert">
            <strong>Inbox belum bisa dibuka.</strong>
            <p>{error}</p>
          </div>
        ) : !inbox.length ? (
          <div className="seller-message-list-state">
            <span aria-hidden="true">✳</span>
            <strong>Belum ada percakapan.</strong>
            <p>Percakapan Customer akan muncul di sini setelah mereka menghubungi servicesmu.</p>
            <Link to="/seller-dashboard/services">Kelola services </Link>
          </div>
        ) : !rows.length ? (
          <div className="seller-message-list-state">
            <strong>Customer tidak ditemukan.</strong>
            <p>Coba nama lain.</p>
            <button type="button" onClick={() => setSearch("")}>Hapus pencarian</button>
          </div>
        ) : (
          <nav aria-label="Sign up percakapan Customer">
            {rows.map((row) => (
              <NavLink
                key={row.id}
                to={`/seller-dashboard/messages/${encodeURIComponent(row.id)}`}
                className={`seller-message-row${row.id === activeId ? " is-active" : ""}`}
              >
                <Avatar
                  key={`${row.customer_name}|${row.customer_avatar_url}`}
                  name={row.customer_name}
                  src={row.customer_avatar_url}
                />
                <span className="seller-message-row-copy">
                  <span className="seller-message-row-top">
                    <strong>{row.customer_name}</strong>
                    <time dateTime={row.last_activity_at}>{formatTime(row.last_activity_at)}</time>
                  </span>
                  <span className="seller-message-service">{row.service_title}</span>
                  <span className="seller-message-preview">
                    <span>{row.last_message?.content || "Percakapan baru"}</span>
                    {row.unread_count > 0 && (
                      <span className="seller-message-unread" aria-label={`${row.unread_count} pesan unread`}>
                        {row.unread_count}
                      </span>
                    )}
                  </span>
                </span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      <footer className="seller-message-inbox-footer">
        <span aria-hidden="true">◈</span>
        <span>Collaboration starts with a conversation.</span>
      </footer>
    </aside>
  );
}

function Chat({ conversationId, data, error, user }) {
  const [text, setText] = useState("");
  const [failure, setFailure] = useState("");
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [nearBottom, setNearBottom] = useState(true);
  const scroller = useRef(null);
  const lock = useRef(false);
  const ownSend = useRef(false);
  const retryId = useRef("");
  const messages = data?.messages || [];
  const conversation = data?.conversation;
  const lastId = messages.at(-1)?.id;
  const unreadKey = messages
    .filter((item) => item.sender_user_id !== user?.id && !item.read_at)
    .map((item) => item.id)
    .join(",");

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && (nearBottom || ownSend.current)) {
      node.scrollTop = node.scrollHeight;
      ownSend.current = false;
    }
  }, [lastId, nearBottom]);

  useEffect(() => {
    if (!conversationId || !unreadKey || !visible || !nearBottom) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        sellerMessaging.markRead(conversationId);
      } catch (reason) {
        if (active)
          setFailure(reason.message || "The message could not be marked as read.");
      }
    });
    return () => {
      active = false;
    };
  }, [conversationId, unreadKey, visible, nearBottom]);

  function submit(event) {
    event.preventDefault();
    if (lock.current || !text.trim()) return;
    lock.current = true;
    setNearBottom(true);
    setSending(true);
    setFailure("");
    queueMicrotask(() => {
      try {
        retryId.current ||= globalThis.crypto.randomUUID();
        ownSend.current = true;
        sellerMessaging.send(conversationId, text, {
          client_event_id: retryId.current,
        });
        retryId.current = "";
        setText("");
      } catch (reason) {
        ownSend.current = false;
        setFailure(reason.message || "The message could not be sent.");
      } finally {
        lock.current = false;
        setSending(false);
      }
    });
  }

  if (error || !data || !conversation)
    return (
      <section className="seller-message-thread" aria-label="Ruang chat">
        <header className="seller-message-chat-header">
          <Link className="seller-message-back" to="/seller-dashboard/messages">← Inbox</Link>
          <h2>Percakapan</h2>
        </header>
        <div className="seller-message-thread-state" role={error ? "alert" : "status"}>
          <strong>{error ? "The conversation could not be opened." : "Choose a conversation."}</strong>
          {error && <p>{error}</p>}
        </div>
      </section>
    );

  return (
    <section className="seller-message-thread" aria-label={`Conversation with ${conversation.customer_name}`}>
      <header className="seller-message-chat-header">
        <Link className="seller-message-back" to="/seller-dashboard/messages">← Inbox</Link>
        <Avatar
          key={`${conversation.customer_name}|${conversation.customer_avatar_url}`}
          name={conversation.customer_name}
          src={conversation.customer_avatar_url}
        />
        <div className="seller-message-chat-identity">
          <h2>{conversation.customer_name}</h2>
          <p title={conversation.service_title}>
            {conversation.service_title}
            <span> · {conversation.booking_id ? "Booking" : "Service discussion"}</span>
          </p>
        </div>
        {conversation.booking_id && (
          <Link className="seller-message-booking-link" to={`/seller-dashboard/orders/${encodeURIComponent(conversation.booking_id)}`}>
            Orders
          </Link>
        )}
      </header>
      <div
        className="seller-message-history"
        role="log"
        aria-label="Message history"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          setNearBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 80);
        }}
      >
        {!messages.length && (
          <div className="seller-message-thread-empty">
            <span aria-hidden="true">✳</span>
            <h3>Start with a greeting.</h3>
            <p>Balas Customer dan lanjutkan diskusi proyek di sini.</p>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.sender_user_id === user.id;
          const safety = messageSafety(message.content);
          const isNewDay =
            index === 0 ||
            new Date(message.created_at).toDateString() !==
              new Date(messages[index - 1].created_at).toDateString();
          return (
            <Fragment key={message.id}>
              {isNewDay && (
                <div className="seller-message-date">
                  <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}</time>
                </div>
              )}
              <article className={`seller-message-bubble${mine ? " is-mine" : ""}`} aria-label={`Message ${mine ? "from you" : `from ${conversation.customer_name}`}`}>
                <p>{message.content}</p>
                {safety.off_platform_payment_suspected && (
                  <aside className="seller-message-safety">{safety.advisory}</aside>
                )}
                <footer>
                  <time dateTime={message.created_at} title={formatTime(message.created_at, true)}>{formatTime(message.created_at)}</time>
                  {mine && <span>{message.read_at ? "Dibaca" : "Terkirim"}</span>}
                </footer>
              </article>
            </Fragment>
          );
        })}
      </div>
      {(failure || error) && <p className="seller-message-error" role="alert">{failure || error}</p>}
      <form className="seller-message-composer" onSubmit={submit} aria-busy={sending}>
        <label className="seller-message-sr-only" htmlFor="seller-message-input">Write a message to the customer</label>
        <textarea
          id="seller-message-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="Write a message…"
          disabled={sending}
        />
        <button className="button button--primary" type="submit" disabled={sending || !text.trim()}>
          {sending ? "Mengirim…" : "Send message "}
        </button>
      </form>
    </section>
  );
}

export default function SellerMessagingPage() {
  const { conversationId = "" } = useParams();
  const { inbox, thread, error, user } = useSellerMessaging(conversationId);
  const current = !!conversationId;
  return (
    <SellerFrame
      title="Pesan Customer."
      description="Continue project conversations with customers from one inbox."
    >
      <div className={`seller-message-workspace${current ? " has-conversation" : ""}`}>
        <Inbox inbox={inbox} activeId={conversationId} error={error && !current ? error : ""} />
        {current ? (
          <Chat key={`${user?.id}-${conversationId}`} conversationId={conversationId} data={thread} error={error} user={user} />
        ) : (
          <section className="seller-message-thread seller-message-welcome" aria-label="Choose a conversation">
            {error ? (
              <Empty title="Messages could not be opened.">{error}</Empty>
            ) : inbox.length ? (
              <>
                <span className="seller-message-welcome-mark" aria-hidden="true">✳</span>
                <span className="seller-message-eyebrow">RUANG KOLABORASI</span>
                <h2>Good conversations open up possibilities.</h2>
                <p>Choose a customer in your inbox to view the history and reply.</p>
              </>
            ) : (
              <Empty title="Your inbox is ready for its first conversation.">
                Customers who contact you about your services will appear in the left panel.
              </Empty>
            )}
          </section>
        )}
      </div>
    </SellerFrame>
  );
}

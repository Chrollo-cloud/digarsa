import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { messageSafety } from "../messaging/contracts.js";
import { ContextBar, ContextCard } from "../messaging/ChatContext.jsx";
import { Empty } from "../workspace/WorkspaceFrame.jsx";
import SellerFrame from "./SellerFrame.jsx";
import { sellerMessaging } from "./sellerMessagingClient.js";
import { useSellerMessaging } from "./useSellerMessaging.js";
// Tampilan chat Seller memakai stylesheet yang SAMA dengan chat Customer.
import "../messaging/messaging.css";
import "../messaging/workspace.css";
import "./sellerMessaging.css";

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("id-ID") || "")
      .join("") || "C"
  );
}

function Avatar({ name, src }) {
  const [failed, setFailed] = useState(false);

  return src && !failed ? (
    <img
      className="workspace-avatar"
      src={src}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="workspace-avatar" aria-hidden="true">
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
    ? date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleString("id-ID", {
        dateStyle: "medium",
        ...(includeDate ? { timeStyle: "short" } : {}),
      });
}

const dayKey = (time) => new Date(time).toLocaleDateString("id-ID");
const dayLabel = (time) =>
  new Date(time).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function Inbox({ inbox, activeId, error }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("id-ID");

  const rows = inbox.filter((row) =>
    [
      row.customer_name,
      row.service_title,
      ...(row.contexts || []).map((context) => context.service_title),
      row.last_message?.content || "",
    ].some((value) =>
      String(value || "")
        .toLocaleLowerCase("id-ID")
        .includes(query),
    ),
  );

  const unread = inbox.reduce(
    (count, row) => count + (row.unread_count || 0),
    0,
  );

  return (
    <aside className="workspace-inbox" aria-label="Inbox Customer">
      <header className="workspace-inbox-heading">
        <div>
          <span className="workspace-eyebrow">DIGARSA / SELLER CENTER</span>
          <h2>
            Pesan<span>.</span>
          </h2>
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
          <span className="workspace-sr-only">Cari Customer</span>
          <input
            type="search"
            placeholder="Cari customer atau layanan…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <p className="workspace-list-caption" aria-live="polite">
          {error
            ? "Inbox belum tersedia"
            : query
              ? `${rows.length} hasil pencarian`
              : `${inbox.length} Customer · terbaru di atas`}
        </p>
      </div>

      <div className="workspace-conversations">
        {error ? (
          <div className="workspace-list-state" role="alert">
            <strong>Inbox belum bisa dibuka.</strong>
            <p>{error}</p>
          </div>
        ) : !inbox.length ? (
          <div className="workspace-list-state">
            <span aria-hidden="true">✳</span>
            <strong>Belum ada percakapan.</strong>
            <p>
              Percakapan Customer akan muncul di sini setelah mereka
              menghubungi layananmu.
            </p>
            <Link to="/seller-dashboard/services">Kelola layanan ↗</Link>
          </div>
        ) : !rows.length ? (
          <div className="workspace-list-state">
            <strong>Customer tidak ditemukan.</strong>
            <p>Coba nama customer atau layanan lain.</p>
            <button type="button" onClick={() => setSearch("")}>
              Hapus pencarian
            </button>
          </div>
        ) : (
          <nav aria-label="Daftar percakapan Customer">
            {rows.map((row) => {
              const active =
                row.id === activeId ||
                row.conversation_ids?.includes(activeId);

              return (
                <NavLink
                  key={row.id}
                  to={`/seller-dashboard/messages/${encodeURIComponent(row.id)}`}
                  className={`workspace-conversation${active ? " is-active" : ""}`}
                >
                  <Avatar
                    key={`${row.customer_name}|${row.customer_avatar_url}`}
                    name={row.customer_name}
                    src={row.customer_avatar_url}
                  />

                  <div className="workspace-conversation-copy">
                    <div className="workspace-conversation-top">
                      <strong>{row.customer_name}</strong>
                      <time dateTime={row.last_activity_at}>
                        {formatTime(row.last_activity_at)}
                      </time>
                    </div>

                    <span className="workspace-service-label">
                      {row.conversation_ids?.length > 1
                        ? `${row.conversation_ids.length} percakapan layanan`
                        : row.service_title}
                    </span>

                    <div className="workspace-conversation-preview">
                      <p>{row.last_message?.content || "Percakapan baru"}</p>

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
                      {row.conversation_ids?.length > 1
                        ? `${row.conversation_ids.length} LAYANAN`
                        : row.booking_id
                          ? "BOOKING"
                          : "DISKUSI LAYANAN"}
                    </small>
                  </div>
                </NavLink>
              );
            })}
          </nav>
        )}
      </div>

      <footer className="workspace-inbox-footer">
        <span aria-hidden="true">◈</span>
        <span>Kolaborasi dimulai dari percakapan.</span>
      </footer>
    </aside>
  );
}

function Back() {
  return (
    <Link
      className="workspace-back"
      to="/seller-dashboard/messages"
      aria-label="Kembali ke inbox"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path d="m14 6-6 6 6 6" />
      </svg>
      <span>Inbox</span>
    </Link>
  );
}

function Chat({ conversationId, data, error, user }) {
  const [text, setText] = useState("");
  const [failure, setFailure] = useState("");
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const [nearBottom, setNearBottom] = useState(true);
  const [pick, setPick] = useState(null);

  const scroller = useRef(null);
  const composer = useRef(null);
  const lock = useRef(false);
  const ownSend = useRef(false);
  const retryId = useRef("");

  const messages = data?.messages || [];
  const conversation = data?.conversation;
  const contexts = conversation?.contexts || [];

  // Seperti marketplace: balasan otomatis mengikuti topik pesan customer
  // terakhir. Pilihan manual seller berlaku sampai ada pesan masuk baru.
  const lastIncomingContext = messages
    .filter((item) => item.sender_user_id !== user?.id)
    .at(-1)?.context_id;

  const manual =
    pick && pick.incoming === lastIncomingContext
      ? contexts.find((context) => context.id === pick.id)
      : null;

  const selectedContext =
    manual ||
    contexts.find((context) => context.id === lastIncomingContext) ||
    contexts[0] ||
    null;

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

  useLayoutEffect(() => {
    const node = composer.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }, [text]);

  useEffect(() => {
    if (!conversationId || !unreadKey || !visible || !nearBottom) {
      return;
    }

    let active = true;

    queueMicrotask(() => {
      if (!active) return;

      try {
        sellerMessaging.markRead(conversationId);
      } catch (reason) {
        if (active) {
          setFailure(reason.message || "Pesan belum dapat ditandai dibaca.");
        }
      }
    });

    return () => {
      active = false;
    };
  }, [conversationId, unreadKey, visible, nearBottom]);

  function submit(event) {
    event.preventDefault();

    if (lock.current || !text.trim() || !selectedContext || sending) {
      return;
    }

    lock.current = true;
    setNearBottom(true);
    setSending(true);
    setFailure("");

    const content = text.trim();

    queueMicrotask(() => {
      try {
        retryId.current ||= globalThis.crypto.randomUUID();
        ownSend.current = true;

        sellerMessaging.sendForCustomer(
          conversationId,
          selectedContext.id,
          content,
          {
            client_event_id: retryId.current,
          },
        );

        retryId.current = "";
        setText("");
      } catch (reason) {
        ownSend.current = false;
        setFailure(reason.message || "Pesan belum dapat dikirim.");
      } finally {
        lock.current = false;
        setSending(false);
        composer.current?.focus({ preventScroll: true });
      }
    });
  }

  if (error || !data || !conversation) {
    return (
      <section
        className="workspace-thread workspace-thread--error"
        aria-label="Ruang chat"
      >
        <header className="workspace-thread-header">
          <Back />
          <h2>Percakapan</h2>
        </header>

        <div
          className="workspace-list-state"
          role={error ? "alert" : "status"}
        >
          <strong>
            {error ? "Percakapan belum bisa dibuka." : "Pilih percakapan."}
          </strong>
          {error && <p>{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section
      className="workspace-thread"
      aria-label={`Percakapan dengan ${conversation.customer_name}`}
    >
      <header className="workspace-thread-header">
        <Back />

        <Avatar
          key={`${conversation.customer_name}|${conversation.customer_avatar_url}`}
          name={conversation.customer_name}
          src={conversation.customer_avatar_url}
        />

        <div className="workspace-thread-identity">
          <h2>{conversation.customer_name}</h2>
          <p>
            {contexts.length > 1
              ? `${contexts.length} percakapan layanan`
              : conversation.service_title}
          </p>
        </div>

        {selectedContext?.booking_id && (
          <Link
            className="workspace-service-link"
            to={`/seller-dashboard/orders/${encodeURIComponent(selectedContext.booking_id)}`}
          >
            <span>Lihat pesanan</span>
            <span aria-hidden="true">↗</span>
          </Link>
        )}
      </header>

      <div
        className="workspace-history"
        role="log"
        aria-label="Gabungan riwayat pesan"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;

          setNearBottom(
            node.scrollHeight - node.scrollTop - node.clientHeight < 96,
          );
        }}
      >
        {!messages.length && (
          <div className="workspace-thread-empty">
            <span aria-hidden="true">✳</span>
            <h3>Awali dengan sapaan.</h3>
            <p>Balas Customer dan lanjutkan diskusi proyek di sini.</p>
            <div className="chat-ctx-empty-card">
              <ContextCard context={selectedContext} role="seller" />
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const mine = message.sender_user_id === user?.id;
          const safety = messageSafety(message.content);

          const newDay =
            index === 0 ||
            dayKey(message.created_at) !==
              dayKey(messages[index - 1].created_at);

          const newContext =
            index === 0 ||
            messages[index - 1].context_id !== message.context_id;

          return (
            <Fragment key={message.id}>
              {newDay && (
                <div className="workspace-date">
                  <time dateTime={message.created_at}>
                    {dayLabel(message.created_at)}
                  </time>
                </div>
              )}

              {newContext && (
                <ContextCard
                  context={contexts.find((row) => row.id === message.context_id)}
                  role="seller"
                />
              )}

              <article
                className={`workspace-bubble${mine ? " is-mine" : ""}`}
                aria-label={`Pesan ${
                  mine ? "dari kamu" : `dari ${conversation.customer_name}`
                }`}
              >
                <p>{message.content}</p>

                {safety.off_platform_payment_suspected && (
                  <aside className="messaging-safety">{safety.advisory}</aside>
                )}

                <footer>
                  <time
                    dateTime={message.created_at}
                    title={formatTime(message.created_at, true)}
                  >
                    {new Date(message.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>

                  {mine && (
                    <span>{message.read_at ? "Dibaca" : "Terkirim"}</span>
                  )}
                </footer>
              </article>
            </Fragment>
          );
        })}
      </div>

      <form
        className="workspace-composer"
        onSubmit={submit}
        aria-busy={sending}
      >
        {!nearBottom && (
          <button
            className="workspace-latest"
            type="button"
            onClick={() => {
              const node = scroller.current;
              if (node) node.scrollTop = node.scrollHeight;
            }}
          >
            ↓ Ke pesan terbaru
          </button>
        )}

        {(failure || error) && (
          <p role="alert" className="messaging-error">
            {failure || error}
          </p>
        )}

        <label htmlFor="seller-message-input" className="workspace-sr-only">
          Tulis pesan kepada Customer
        </label>

        <ContextBar
          contexts={contexts}
          selectedId={selectedContext?.id || ""}
          onSelect={(id) => setPick({ id, incoming: lastIncomingContext })}
          disabled={sending}
        />

        <div className="workspace-compose-row">
          <textarea
            id="seller-message-input"
            ref={composer}
            value={text}
            rows={1}
            maxLength={4000}
            readOnly={sending}
            disabled={!selectedContext}
            placeholder={
              selectedContext
                ? `Balas tentang ${selectedContext.service_title || "layanan ini"}…`
                : "Tulis pesan…"
            }
            onChange={(event) => {
              setText(event.target.value);
              retryId.current = "";
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                event.currentTarget.form.requestSubmit();
              }
            }}
          />

          <button
            type="submit"
            disabled={sending || !text.trim() || !selectedContext}
            aria-label="Kirim pesan"
          >
            {sending ? (
              <span aria-hidden="true">…</span>
            ) : (
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                <path d="m10 14 6-6" />
              </svg>
            )}
          </button>
        </div>

        <div className="workspace-composer-hints">
          <small>
            Enter untuk kirim <span>· Shift+Enter untuk baris baru</span>
          </small>
          <span role="status">
            {sending ? "Mengirim…" : `${text.length}/4000`}
          </span>
        </div>

        <small className="workspace-payment-note">
          Chat bukan bukti atau instruksi pembayaran tepercaya. Jangan
          arahkan Customer membayar di luar alur resmi Digarsa.
        </small>
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
      description="Lanjutkan pembicaraan proyek dengan Customer dari satu inbox."
    >
      <div className={`seller-chat${current ? " seller-chat--open" : ""}`}>
        <div className="workspace-panels">
          <Inbox
            inbox={inbox}
            activeId={conversationId}
            error={error && !current ? error : ""}
          />

          <div className="workspace-chat-panel">
            {current ? (
              <Chat
                key={`${user?.id}-${conversationId}`}
                conversationId={conversationId}
                data={thread}
                error={error}
                user={user}
              />
            ) : (
              <section
                className="workspace-welcome"
                aria-label="Pilih percakapan"
              >
                {error ? (
                  <Empty title="Pesan belum bisa dibuka.">{error}</Empty>
                ) : (
                  <>
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
                      RUANG KOLABORASI
                    </span>
                    <h2>
                      Obrolan kecil.
                      <br />
                      Kemungkinan besar<span>.</span>
                    </h2>
                    <p>
                      {inbox.length
                        ? "Pilih Customer di inbox untuk melihat riwayat dan membalas pesan."
                        : "Customer yang menghubungi layananmu akan muncul di panel kiri."}
                    </p>
                    <Link to="/seller-dashboard/services">
                      Kelola layanan ↗
                    </Link>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </SellerFrame>
  );
}
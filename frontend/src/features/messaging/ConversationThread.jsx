import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { customerMessaging } from "./customerMessagingClient";
import { messageSafety } from "./customerMessaging";
import { useMessaging } from "./useMessaging";
import MessagingState from "./MessagingState";
import { ContextBar, ContextCard } from "./ChatContext";

function MobileBack() {
  return (
    <Link
      className="workspace-back"
      to="/messages"
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
const dayKey = (time) => new Date(time).toLocaleDateString("id-ID");
const dayLabel = (time) =>
  new Date(time).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function ConversationThread({ id }) {
  const { user, data, error } = useMessaging(() =>
    customerMessaging.getThread(id),
  );
  const [text, setText] = useState("");
  const [failure, setFailure] = useState("");
  const [sending, setSending] = useState(false);
  const [away, setAway] = useState(false);
  const location = useLocation();
  // Datang dari tombol "Chat Kreator": topik awal = layanan/booking tersebut.
  const [pickedContextId, setPickedContextId] = useState(
    () => location.state?.contextId || "",
  );
  const scroller = useRef(null);
  const composer = useRef(null);
  const nearBottom = useRef(true);
  const sendingLock = useRef(false);
  const ownSend = useRef(false);
  const retryId = useRef(null);
  const messages = data?.messages || [];
  // Every service/booking with this seller lives in ONE thread; this picks which
  // context a new message is sent through (defaults to the most recent one).
  const contexts = data?.conversation?.contexts || [];
  const selectedContext =
    contexts.find((row) => row.id === pickedContextId) || contexts[0] || null;
  const lastId = messages.at(-1)?.id;
  const unread = messages
    .filter((row) => row.sender_user_id !== user.id && row.read_at === null)
    .map((row) => row.id)
    .join(",");

  useEffect(() => {
    let active = true;
    const read = () => {
      if (
        !active ||
        document.visibilityState !== "visible" ||
        !unread ||
        !nearBottom.current
      )
        return;
      try {
        customerMessaging.markRead(id);
      } catch (error) {
        if (active) setFailure(error.message);
      }
    };
    queueMicrotask(read);
    document.addEventListener("visibilitychange", read);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", read);
    };
  }, [id, unread, away]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && (nearBottom.current || ownSend.current)) {
      node.scrollTop = node.scrollHeight;
      ownSend.current = false;
    }
  }, [lastId]);

  useLayoutEffect(() => {
    const node = composer.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }, [text]);

  function submit(event) {
    event.preventDefault();
    if (sendingLock.current || !text.trim() || !selectedContext) return;
    sendingLock.current = true;
    setSending(true);
    setFailure("");
    queueMicrotask(() => {
      try {
        retryId.current ||= crypto.randomUUID();
        ownSend.current = true;
        customerMessaging.send(selectedContext.id, text, {
          client_event_id: retryId.current,
        });
        setPickedContextId(selectedContext.id);
        retryId.current = null;
        setText("");
      } catch (error) {
        ownSend.current = false;
        setFailure(error.message);
      } finally {
        sendingLock.current = false;
        setSending(false);
        composer.current?.focus({ preventScroll: true });
      }
    });
  }

  if (error || !data)
    return (
      <section className="workspace-thread workspace-thread--error">
        <header className="workspace-thread-header">
          <MobileBack />
          <h2>Percakapan</h2>
        </header>
        <MessagingState
          error={error || "Percakapan tidak ditemukan."}
          showLink={false}
        />
      </section>
    );
  const conversation = data.conversation;
  return (
    <section
      className="workspace-thread"
      aria-label={`Percakapan dengan ${conversation.seller_name}`}
    >
      <header className="workspace-thread-header">
        <MobileBack />
        {conversation.seller_image ? (
          <img
            className="workspace-avatar"
            src={conversation.seller_image}
            alt=""
          />
        ) : (
          <span className="workspace-avatar" aria-hidden="true">
            {conversation.seller_name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="workspace-thread-identity">
          <h2>{conversation.seller_name}</h2>
          <p title={conversation.service_title}>
            {contexts.length > 1
              ? `${contexts.length} layanan`
              : conversation.service_title}
            <span>
              {" "}
              ·{" "}
              {contexts.length === 1 && !selectedContext?.booking_id
                ? "Diskusi layanan"
                : "Booking"}
            </span>
          </p>
        </div>
        {selectedContext?.service_available && (
          <Link
            className="workspace-service-link"
            to={`/service/${selectedContext.service_id}`}
          >
            <span>Lihat layanan</span>
            <span aria-hidden="true">↗</span>
          </Link>
        )}
      </header>
      <div
        className="workspace-history"
        role="log"
        aria-label="Riwayat pesan"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          nearBottom.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 96;
          setAway(!nearBottom.current);
        }}
      >
        {!messages.length && (
          <div className="workspace-thread-empty">
            <span aria-hidden="true">✳</span>
            <h3>Mulai dengan sebuah ide.</h3>
            <p>
              Sapa {conversation.seller_name} dan ceritakan
              <br />
              apa yang ingin kamu wujudkan.
            </p>
            <div className="chat-ctx-empty-card">
              <ContextCard context={selectedContext} role="customer" />
            </div>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.sender_user_id === user.id;
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
                  role="customer"
                />
              )}
              <article
                className={`workspace-bubble ${mine ? "is-mine" : ""}`}
                aria-label={`Pesan dari ${mine ? "kamu" : conversation.seller_name}`}
              >
                <p>{message.content}</p>
                {safety.off_platform_payment_suspected && (
                  <aside className="messaging-safety">{safety.advisory}</aside>
                )}
                <footer>
                  <time
                    dateTime={message.created_at}
                    title={new Date(message.created_at).toLocaleString("id-ID")}
                  >
                    {new Date(message.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {mine && (
                    <span>
                      {message.read_at ? "Dibaca" : "Terkirim · belum dibaca"}
                    </span>
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
        {away && (
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
        {failure && (
          <p role="alert" className="messaging-error">
            {failure}
          </p>
        )}
        <label htmlFor="message-content" className="workspace-sr-only">
          Pesan untuk kreator
        </label>
        <ContextBar
          contexts={contexts}
          selectedId={selectedContext?.id || ""}
          onSelect={setPickedContextId}
          disabled={sending}
        />
        <div className="workspace-compose-row">
          <textarea
            id="message-content"
            ref={composer}
            value={text}
            rows={1}
            maxLength={4000}
            readOnly={sending}
            placeholder="Bagikan ide atau tulis pesan…"
            aria-describedby="workspace-composer-help workspace-payment-note"
            onChange={(event) => {
              setText(event.target.value);
              retryId.current = null;
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
            disabled={sending || !text.trim()}
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
          <small id="workspace-composer-help">
            Enter untuk kirim <span>· Shift+Enter untuk baris baru</span>
          </small>
          <span role="status">
            {sending ? "Mengirim…" : `${text.length}/4000`}
          </span>
        </div>
        <small id="workspace-payment-note" className="workspace-payment-note">
          Chat bukan bukti atau instruksi pembayaran tepercaya. Jangan bayar di
          luar alur resmi Digarsa.
        </small>
      </form>
    </section>
  );
}
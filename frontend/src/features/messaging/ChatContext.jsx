import { useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../data/marketplace";
import "./chatContext.css";

// Komponen konteks chat gaya marketplace (kartu produk di dalam percakapan).
// Dipakai bersama oleh chat Customer dan chat Seller supaya tampilannya identik.
// `context` = satu percakapan layanan/booking dari facade:
//   { id, service_id, booking_id, service_title, service_image,
//     service_price, service_available, booking_status }

const shortId = (value = "") => String(value).replace(/^booking-/, "").slice(0, 8);

function Thumb({ context }) {
  const [failed, setFailed] = useState(false);
  return context.service_image && !failed ? (
    <img
      className="chat-ctx-thumb"
      src={context.service_image}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="chat-ctx-thumb is-empty" aria-hidden="true">
      ✳
    </span>
  );
}

function links(context, role) {
  const out = [];
  if (context.service_available && context.service_id) {
    out.push({
      to: `/service/${encodeURIComponent(context.service_id)}`,
      label: "Lihat layanan",
    });
  }
  if (context.booking_id) {
    out.push({
      to:
        role === "seller"
          ? `/seller-dashboard/orders/${encodeURIComponent(context.booking_id)}`
          : `/orders/${encodeURIComponent(context.booking_id)}`,
      label: "Lihat pesanan",
    });
  }
  return out;
}

// Kartu di dalam riwayat chat: muncul saat topik (layanan/booking) berganti.
export function ContextCard({ context, role = "customer" }) {
  if (!context) return null;
  const price = Number.isFinite(Number(context.service_price))
    ? money(context.service_price)
    : "";
  return (
    <div className="chat-ctx-card" role="group" aria-label="Topik percakapan">
      <Thumb context={context} />
      <div className="chat-ctx-body">
        <span className="chat-ctx-kicker">
          {context.booking_id
            ? `BOOKING · ${shortId(context.booking_id)}`
            : "DITANYAKAN TENTANG LAYANAN"}
          {context.booking_status && (
            <em className="chat-ctx-status">{context.booking_status}</em>
          )}
        </span>
        <strong title={context.service_title}>{context.service_title}</strong>
        {price && <span className="chat-ctx-price">{price}</span>}
      </div>
      <div className="chat-ctx-links">
        {links(context, role).map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label} <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Pratinjau topik di atas kolom ketik (seperti pratinjau produk di Shopee).
// Pesan otomatis mengikuti topik ini. Bila ada lebih dari satu topik,
// tombol "Ganti topik" membuka daftar kecil; daftar tidak selalu tampil.
export function ContextBar({
  contexts,
  selectedId,
  onSelect,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const selected =
    contexts.find((context) => context.id === selectedId) || contexts[0];
  if (!selected) return null;
  const many = contexts.length > 1;
  const sub = (context) =>
    context.booking_id
      ? `Booking · ${shortId(context.booking_id)}`
      : "Diskusi layanan";

  return (
    <div
      className="chat-ctx-bar"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {many && open && !disabled && (
        <ul className="chat-ctx-menu" role="listbox" aria-label="Pilih topik">
          {contexts.map((context) => (
            <li key={context.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={context.id === selected.id}
                className={`chat-ctx-option${context.id === selected.id ? " is-selected" : ""}`}
                onClick={() => {
                  onSelect(context.id);
                  setOpen(false);
                }}
              >
                <Thumb context={context} />
                <span>
                  <strong>{context.service_title}</strong>
                  <small>{sub(context)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="chat-ctx-current">
        <Thumb context={selected} />
        <span className="chat-ctx-current-copy">
          <small>MEMBAHAS</small>
          <strong title={selected.service_title}>{selected.service_title}</strong>
          <small>{sub(selected)}</small>
        </span>
        {many && (
          <button
            type="button"
            className="chat-ctx-switch"
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((value) => !value)}
          >
            Ganti topik
          </button>
        )}
      </div>
    </div>
  );
}
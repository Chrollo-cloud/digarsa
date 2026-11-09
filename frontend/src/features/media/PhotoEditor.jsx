import { useEffect, useRef, useState } from "react";
import { mediaStore, preparePhoto } from "./mediaStore";
import { useLocalImage } from "./useLocalImage";
import "./photos.css";

export default function PhotoEditor({ ownerUserId, scope, mediaId, url, currentOwner, onCommit }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const saved = useLocalImage({ mediaId, url, ownerUserId, scope, onError: setError });
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!draft) return;
    return () => URL.revokeObjectURL(draft.src);
  }, [draft]);
  async function select(file) {
    const ticket = ++request.current;
    setError(""); setMessage(""); setBusy(true);
    try { const blob = await preparePhoto(file); if (ticket === request.current) setDraft({ blob, src: URL.createObjectURL(blob) }); }
    catch (failure) { if (ticket === request.current) setError(failure.message); }
    finally { if (ticket === request.current) setBusy(false); }
  }
  function cancel() { request.current++; setDraft(null); setBusy(false); setError(""); }
  async function commit(remove = false) {
    const ticket = ++request.current;
    setBusy(true); setError(""); setMessage("");
    let id = "";
    try {
      if (currentOwner() !== ownerUserId) throw new Error("Sesi berubah. Buka kembali foto dari akun aktif.");
      if (!remove) id = await mediaStore.put(draft.blob, ownerUserId, scope);
      if (ticket !== request.current || currentOwner() !== ownerUserId) {
        if (id) await mediaStore.remove(id, ownerUserId, scope);
        throw new Error("Sesi berubah. Foto tidak diterapkan.");
      }
      onCommit(id);
      setDraft(null);
      setMessage(remove ? "Foto dihapus dari profil." : "Foto tersimpan pada perangkat ini, bukan di server.");
      if (mediaId) await mediaStore.remove(mediaId, ownerUserId, scope).catch(() => {});
    } catch (failure) {
      if (id) await mediaStore.remove(id, ownerUserId, scope).catch(() => {});
      if (ticket === request.current) setError(failure.message);
    } finally { if (ticket === request.current) setBusy(false); }
  }
  if (!import.meta.env.DEV) return <p>Foto perangkat tersedia pada mode pengembangan lokal. URL foto tetap dapat digunakan.</p>;
  return (
    <section className="photo-editor" aria-label={scope === "seller" ? "Foto Seller Profile" : "Foto akun"}>
      <div>
        <h2>{scope === "seller" ? "Foto Seller Profile" : "Foto profil dari perangkat"}</h2>
        <p>Demo lokal · JPEG, PNG, WebP hingga 5 MB. Tidak diunggah ke server atau disinkronkan ke perangkat lain.</p>
      </div>
      {(draft ? draft.src : saved) && <img className="photo-editor__preview" src={draft ? draft.src : saved} alt="Pratinjau foto profil" />}
      <label className="photo-editor__choose">Pilih / ganti foto
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void select(file); }} />
      </label>
      <div className="photo-editor__actions">
        {draft && <><button type="button" className="button button--aqua" disabled={busy} onClick={() => void commit()}>Simpan foto pada perangkat</button>
          <button type="button" className="button button--secondary" onClick={cancel}>Batal</button></>}
        {!draft && (mediaId || url) && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void commit(true)}>Hapus foto</button>}
      </div>
      {busy && <p role="status">Memproses foto…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

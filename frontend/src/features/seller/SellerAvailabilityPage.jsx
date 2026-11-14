import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Empty } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

const blank = { date: "", startTime: "09:00", endTime: "10:00", note: "" };

export default function SellerAvailabilityPage() {
  const { serviceId } = useParams();
  const { services, servicesStatus, servicesError, catalog } = useSeller();
  const service = services.find((item) => item.id === serviceId);
  const [slots, setSlots] = useState([]);
  const [status, setStatus] = useState("idle");
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadSlots() {
    if (!service) return;
    setStatus("loading");
    setError("");
    try {
      setSlots(await catalog.listAvailability(service.id));
      setStatus("ready");
    } catch (failure) {
      setStatus("error");
      setError(failure.message || "Jadwal tidak dapat dimuat.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (servicesStatus === "ready" && service) void loadSlots();
    // loadSlots intentionally follows the selected server service.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id, servicesStatus]);

  function edit(event) {
    setDraft((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }
  function resetForm() {
    setDraft(blank);
    setEditingId("");
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const saved = editingId
        ? await catalog.updateAvailability(service.id, editingId, draft)
        : await catalog.createAvailability(service.id, draft);
      setSlots((current) => editingId ? current.map((slot) => slot.id === editingId ? saved : slot) : [...current, saved].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
      setSuccess(editingId ? "Jadwal berhasil diperbarui." : "Jadwal berhasil ditambahkan.");
      resetForm();
    } catch (failure) {
      setError(failure.message || "Jadwal tidak dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }
  function startEdit(slot) {
    setEditingId(slot.id);
    setDraft({ date: slot.date, startTime: slot.startTime, endTime: slot.endTime, note: slot.note });
    setError("");
    setSuccess("");
  }
  async function remove(slotId) {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await catalog.removeAvailability(service.id, slotId);
      setSlots((current) => current.filter((slot) => slot.id !== slotId));
      setConfirmingId("");
      setSuccess("Jadwal berhasil dihapus.");
    } catch (failure) {
      setError(failure.message || "Jadwal tidak dapat dihapus.");
    } finally {
      setSaving(false);
    }
  }

  if (servicesStatus === "loading" || servicesStatus === "idle")
    return <SellerFrame title="Memuat layanan…"><p role="status" className="ws-notice">Memuat layanan seller.</p></SellerFrame>;
  if (servicesStatus === "error")
    return <SellerFrame title="Jadwal tidak dapat dimuat."><p role="alert" className="ws-alert">{servicesError} <button type="button" className="location-link" onClick={() => void catalog.refresh().catch(() => {})}>Coba lagi</button></p></SellerFrame>;
  if (!service)
    return (
      <SellerFrame title="Service not found.">
        <Empty title="This service does not belong to you or has been deleted.">Jadwal hanya dapat dikelola oleh pemilik services.</Empty>
        <Link className="ws-link" to="/seller-dashboard/services">← Service saya</Link>
      </SellerFrame>
    );

  return (
    <SellerFrame title="Availability services." description={`Atur slot waktu untuk ${service.title}. Slot ini membantu perencanaan seller; formulir booking Customer saat ini hanya meminta tanggal, belum jam.`}>
      <Link className="ws-back" to="/seller-dashboard/services">← Service saya</Link>
      {success && <p className="ws-success" role="status">{success}</p>}
      {error && <p className="ws-alert" role="alert">{error}</p>}
      <form className="ws-panel ws-form ws-availability-form" onSubmit={submit} noValidate>
        <h2>{editingId ? "Ubah slot jadwal." : "Tambah slot jadwal."}</h2>
        <div className="field-pair">
          <div className="field"><label htmlFor="availability-date">Tanggal</label><input id="availability-date" className="field__control" type="date" name="date" min={new Date().toLocaleDateString("en-CA")} value={draft.date} onChange={edit} required /></div>
          <div className="field-pair">
            <div className="field"><label htmlFor="availability-start">Mulai</label><input id="availability-start" className="field__control" type="time" name="startTime" value={draft.startTime} onChange={edit} required /></div>
            <div className="field"><label htmlFor="availability-end">Selesai</label><input id="availability-end" className="field__control" type="time" name="endTime" value={draft.endTime} onChange={edit} required /></div>
          </div>
        </div>
        <div className="field"><label htmlFor="availability-note">Catatan (opsional)</label><input id="availability-note" className="field__control" name="note" value={draft.note} onChange={edit} maxLength={160} /></div>
        <div className="ws-actions">
          <button className="button button--primary" type="submit" disabled={saving}>{saving ? "Menyimpan…" : editingId ? "Save jadwal" : "Tambah jadwal"}</button>
          {editingId && <button className="button button--secondary" type="button" onClick={resetForm} disabled={saving}>Cancel edit</button>}
        </div>
      </form>

      <section className="ws-section" aria-labelledby="availability-list-heading">
        <header><h2 id="availability-list-heading">Jadwal yang dibuat.</h2></header>
        {status === "loading" && <p className="ws-notice" role="status">Memuat jadwal…</p>}
        {status === "error" && <p className="ws-alert" role="alert">Jadwal tidak dapat dimuat. <button type="button" className="location-link" onClick={() => void loadSlots()}>Coba lagi</button></p>}
        {status === "ready" && slots.length ? (
          <ul className="ws-list">{slots.map((slot) => <li className="ws-row" key={slot.id}>
            <div><h3>{dateOnly(`${slot.date}T00:00:00`)}</h3><p>{slot.startTime}–{slot.endTime}{slot.note ? ` · ${slot.note}` : ""}</p></div>
            <div className="ws-row__side">{confirmingId === slot.id ? (
              <div className="ws-actions" role="group" aria-label="Konfirmasi hapus jadwal">
                <button className="button button--danger" type="button" disabled={saving} onClick={() => void remove(slot.id)}>Ya, hapus</button>
                <button className="button button--secondary" type="button" disabled={saving} onClick={() => setConfirmingId("")}>Cancel</button>
              </div>
            ) : <><button className="ws-link-button" type="button" disabled={saving} onClick={() => startEdit(slot)}>Ubah</button><button className="ws-link-button is-danger" type="button" disabled={saving} onClick={() => setConfirmingId(slot.id)}>Hapus</button></>}</div>
          </li>)}</ul>
        ) : status === "ready" ? <Empty title="Belum ada jadwal.">Tambahkan slot waktu agar rencana ketersediaanmu tersimpan.</Empty> : null}
      </section>
    </SellerFrame>
  );
}

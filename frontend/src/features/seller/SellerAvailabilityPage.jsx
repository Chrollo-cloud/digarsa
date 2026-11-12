import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Empty } from "../workspace/WorkspaceFrame";
import { dateOnly } from "../workspace/format";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

const blank = { date: "", startTime: "09:00", endTime: "10:00", note: "" };

export default function SellerAvailabilityPage() {
  const { serviceId } = useParams();
  const { services, catalog } = useSeller();
  const service = services.find((item) => item.id === serviceId);
  const [draft, setDraft] = useState(blank);
  const [editingId, setEditingId] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const schedulesState = (() => {
    if (!service) return { schedules: [], error: "" };
    try {
      return catalog.schedulesFor(service.id);
    } catch (failure) {
      return { schedules: [], error: failure.message };
    }
  })();

  function edit(event) {
    setDraft((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }
  function resetForm() {
    setDraft(blank);
    setEditingId("");
  }
  function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (editingId) catalog.updateSchedule(service.id, editingId, draft);
      else catalog.createSchedule(service.id, draft);
      setSuccess(editingId ? "Jadwal berhasil diperbarui." : "Jadwal berhasil ditambahkan.");
      resetForm();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }
  function startEdit(schedule) {
    setEditingId(schedule.id);
    setDraft({
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      note: schedule.note,
    });
    setError("");
    setSuccess("");
  }
  function remove(scheduleId) {
    setError("");
    setSuccess("");
    try {
      catalog.removeSchedule(service.id, scheduleId);
      setConfirmingId("");
      setSuccess("Jadwal berhasil dihapus.");
    } catch (failure) {
      setError(failure.message);
    }
  }

  if (!service)
    return (
      <SellerFrame title="Service not found.">
        <Empty title="This service does not belong to you or has been deleted.">
          Jadwal hanya dapat dikelola oleh pemilik services.
        </Empty>
        <Link className="ws-link" to="/seller-dashboard/services">← Service saya</Link>
      </SellerFrame>
    );

  return (
    <SellerFrame
      title="Availability services."
      description={`Atur slot waktu untuk ${service.title}. Slot ini membantu perencanaan seller; formulir booking Customer saat ini hanya meminta tanggal, belum jam.`}
    >
      <Link className="ws-back" to="/seller-dashboard/services">← Service saya</Link>
      {success && <p className="ws-success" role="status">{success}</p>}
      {(error || schedulesState.error) && (
        <p className="ws-alert" role="alert">{error || schedulesState.error}</p>
      )}
      <form className="ws-panel ws-form ws-availability-form" onSubmit={submit} noValidate>
        <h2>{editingId ? "Ubah slot jadwal." : "Tambah slot jadwal."}</h2>
        <div className="field-pair">
          <div className="field">
            <label htmlFor="availability-date">Tanggal</label>
            <input
              id="availability-date"
              className="field__control"
              type="date"
              name="date"
              min={new Date().toLocaleDateString("en-CA")}
              value={draft.date}
              onChange={edit}
              required
            />
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="availability-start">Mulai</label>
              <input id="availability-start" className="field__control" type="time" name="startTime" value={draft.startTime} onChange={edit} required />
            </div>
            <div className="field">
              <label htmlFor="availability-end">Completed</label>
              <input id="availability-end" className="field__control" type="time" name="endTime" value={draft.endTime} onChange={edit} required />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="availability-note">Catatan (opsional)</label>
          <input id="availability-note" className="field__control" name="note" value={draft.note} onChange={edit} maxLength={160} />
        </div>
        <div className="ws-actions">
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : editingId ? "Save jadwal" : "Tambah jadwal"}
          </button>
          {editingId && <button className="button button--secondary" type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
      </form>

      <section className="ws-section" aria-labelledby="availability-list-heading">
        <header><h2 id="availability-list-heading">Jadwal yang dibuat.</h2></header>
        {schedulesState.schedules.length ? (
          <ul className="ws-list">
            {schedulesState.schedules.map((schedule) => (
              <li className="ws-row" key={schedule.id}>
                <div>
                  <h3>{dateOnly(`${schedule.date}T00:00:00`)}</h3>
                  <p>{schedule.startTime}–{schedule.endTime}{schedule.note ? ` · ${schedule.note}` : ""}</p>
                </div>
                <div className="ws-row__side">
                  {confirmingId === schedule.id ? (
                    <div className="ws-actions" role="group" aria-label="Konfirmasi hapus jadwal">
                      <button className="button button--danger" type="button" onClick={() => remove(schedule.id)}>Ya, hapus</button>
                      <button className="button button--secondary" type="button" onClick={() => setConfirmingId("")}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button className="ws-link-button" type="button" onClick={() => startEdit(schedule)}>Ubah</button>
                      <button className="ws-link-button is-danger" type="button" onClick={() => setConfirmingId(schedule.id)}>Hapus</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Belum ada jadwal.">Tambahkan slot waktu agar rencana ketersediaanmu tersimpan.</Empty>
        )}
      </section>
    </SellerFrame>
  );
}

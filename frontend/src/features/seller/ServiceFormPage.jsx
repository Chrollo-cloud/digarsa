import PublicLocationFields from "../location/PublicLocationFields";
import { publicLocationFromForm } from "../location/locationModel";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Input from "../../components/ui/Input";
import { sellerCategories } from "../account/demoStore";
import { Empty } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";

const blank = {
  title: "",
  category: sellerCategories[0],
  description: "",
  price: "",
  delivery: "Remote",
  turnaround: "",
  availability: "Open",
  image: "",
  revisionFreeCount: "0",
  revisionRequestWindowHours: "24",
  revisionTerms: "",
};

function ServiceForm({ initial, serviceId, catalog }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const input = {
        ...Object.fromEntries(form),
        serviceLocation: publicLocationFromForm(form),
      };
      if (serviceId) await catalog.update(serviceId, input);
      else await catalog.create(input);
      navigate("/seller-dashboard/services", { state: { sellerSuccess: serviceId ? "Service berhasil diperbarui." : "Service berhasil dibuat." } });
    } catch (failure) {
      setError(failure.message || "Layanan tidak dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="ws-panel ws-form" onSubmit={submit} noValidate>
      <Input
        label="Service title"
        name="title"
        defaultValue={initial.title}
        maxLength={100}
        required
      />
      <div className="field-pair">
        <div className="field">
          <label htmlFor="svc-category">Kategori</label>
          <select
            id="svc-category"
            name="category"
            className="field__control"
            defaultValue={initial.category}
          >
            {sellerCategories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <Input
          label="Starting price (IDR)"
          name="price"
          type="number"
          inputMode="numeric"
          min="10000"
          step="1000"
          defaultValue={initial.price}
          hint="IDR 10,000–100,000,000. This is a starting estimate; agree on the final price with the customer."
          required
        />
      </div>
      <div className="field-pair">
        <div className="field">
          <label htmlFor="svc-delivery">Work mode</label>
          <select
            id="svc-delivery"
            name="delivery"
            className="field__control"
            defaultValue={initial.delivery}
          >
            <option>Remote</option>
          <option value="Onsite">On-site</option>
          </select>
        </div>
        <Input
          label="Estimated turnaround"
          name="turnaround"
          defaultValue={initial.turnaround}
          placeholder="mis. 7–10 hari kerja"
          maxLength={60}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="svc-description">Description</label>
        <textarea
          id="svc-description"
          name="description"
          className="field__control"
          defaultValue={initial.description}
          maxLength={1500}
          required
        />
        <span className="field__hint">
          Describe what customers will receive (30–1500 karakter).
        </span>
      </div>
      <Input
        label="Service image (URL, opsional)"
        name="image"
        type="url"
        defaultValue={initial.image}
        placeholder="https://…"
        hint="Leave blank to use the default Digarsa image."
      />
      <div className="field">
        <label htmlFor="svc-availability">Availability</label>
        <select
          id="svc-availability"
          name="availability"
          className="field__control"
          defaultValue={initial.availability}
        >
          <option value="Open">Available — accepting requests</option>
          <option value="Full-book">Fully booked</option>
        </select>
      </div>
      <PublicLocationFields initial={initial.serviceLocation} inherit />
      <section className="ws-section" aria-labelledby="revision-policy-heading">
        <header><h2 id="revision-policy-heading">Kebijakan revisi</h2></header>
        <div className="field-pair">
          <Input label="Revisi gratis" name="revisionFreeCount" type="number" min="0" step="1" defaultValue={initial.revisionFreeCount ?? "0"} required />
          <div className="field">
            <label htmlFor="revision-window">Batas waktu permintaan revisi</label>
            <select id="revision-window" name="revisionRequestWindowHours" className="field__control" defaultValue={initial.revisionRequestWindowHours ?? "24"} required>
              {[12, 24, 48, 72].map((hours) => <option key={hours} value={hours}>{hours} jam</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="revision-terms">Ketentuan revisi</label>
          <textarea id="revision-terms" name="revisionTerms" className="field__control" defaultValue={initial.revisionTerms || ""} maxLength={2000} required />
          <span className="field__hint">Jelaskan cakupan revisi dan hal yang tidak termasuk (maksimal 2000 karakter).</span>
        </div>
      </section>
      {error && (
        <p className="ws-alert" role="alert">
          {error}
        </p>
      )}
      <div className="ws-actions">
        <button className="button button--primary" type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : serviceId ? "Save perubahan" : "Publish service"}
        </button>
        <Link
          className="button button--secondary"
          to="/seller-dashboard/services"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

export default function ServiceFormPage() {
  const { serviceId } = useParams();
  const { services, servicesStatus, servicesError, catalog, user } = useSeller();
  const existing = serviceId
    ? services.find((item) => item.id === serviceId)
    : null;
  if (serviceId && servicesStatus === "loading") return <SellerFrame title="Memuat layanan…"><p role="status" className="ws-notice">Memuat layanan seller.</p></SellerFrame>;
  if (serviceId && servicesStatus === "error") return <SellerFrame title="Layanan tidak dapat dimuat."><p role="alert" className="ws-alert">{servicesError} <button type="button" className="location-link" onClick={() => void catalog.refresh().catch(() => {})}>Coba lagi</button></p></SellerFrame>;
  if (serviceId && !existing)
    return (
      <SellerFrame title="Service not found.">
        <Empty title="This service does not belong to you or has been deleted.">
          Back ke daftar servicesmu.
        </Empty>
        <Link className="ws-link" to="/seller-dashboard/services">
          ← Service saya
        </Link>
      </SellerFrame>
    );
  return (
    <SellerFrame
      title={serviceId ? "Edit service." : "Service baru."}
      description="Published services appear in the marketplace and can be booked through Digarsa."
    >
      <Link className="ws-back" to="/seller-dashboard/services">
        ← Service saya
      </Link>
      <ServiceForm
        key={`${user.id}-${serviceId || "new"}`}
        initial={existing || blank}
        serviceId={serviceId}
        catalog={catalog}
      />
    </SellerFrame>
  );
}

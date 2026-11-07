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
};

function ServiceForm({ initial, serviceId, catalog }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    setError("");
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (serviceId) catalog.update(serviceId, input);
      else catalog.create(input);
      navigate("/seller-dashboard/services");
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <form className="ws-panel ws-form" onSubmit={submit} noValidate>
      <Input
        label="Judul layanan"
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
          label="Harga mulai dari (Rp)"
          name="price"
          type="number"
          inputMode="numeric"
          min="10000"
          step="1000"
          defaultValue={initial.price}
          hint="Rp 10.000 – Rp 100.000.000. Jadi acuan awal; harga akhir dibahas dengan pelanggan."
          required
        />
      </div>
      <div className="field-pair">
        <div className="field">
          <label htmlFor="svc-delivery">Mode pengerjaan</label>
          <select
            id="svc-delivery"
            name="delivery"
            className="field__control"
            defaultValue={initial.delivery}
          >
            <option>Remote</option>
            <option>Onsite</option>
          </select>
        </div>
        <Input
          label="Estimasi pengerjaan"
          name="turnaround"
          defaultValue={initial.turnaround}
          placeholder="mis. 7–10 hari kerja"
          maxLength={60}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="svc-description">Deskripsi</label>
        <textarea
          id="svc-description"
          name="description"
          className="field__control"
          defaultValue={initial.description}
          maxLength={1500}
          required
        />
        <span className="field__hint">
          Jelaskan apa yang pelanggan dapatkan (30–1500 karakter).
        </span>
      </div>
      <Input
        label="Gambar layanan (URL, opsional)"
        name="image"
        type="url"
        defaultValue={initial.image}
        placeholder="https://…"
        hint="Kosongkan untuk memakai gambar bawaan Digarsa."
      />
      <div className="field">
        <label htmlFor="svc-availability">Ketersediaan</label>
        <select
          id="svc-availability"
          name="availability"
          className="field__control"
          defaultValue={initial.availability}
        >
          <option value="Open">Open — menerima permintaan</option>
          <option value="Full-book">Full-book — jadwal penuh</option>
        </select>
      </div>
      {error && (
        <p className="ws-alert" role="alert">
          {error}
        </p>
      )}
      <div className="ws-actions">
        <button className="button button--primary" type="submit">
          {serviceId ? "Simpan perubahan" : "Terbitkan layanan"}
        </button>
        <Link className="button button--secondary" to="/seller-dashboard/services">
          Batal
        </Link>
      </div>
    </form>
  );
}

export default function ServiceFormPage() {
  const { serviceId } = useParams();
  const { services, catalog } = useSeller();
  const existing = serviceId
    ? services.find((item) => item.id === serviceId)
    : null;
  if (serviceId && !existing)
    return (
      <SellerFrame title="Layanan tidak ditemukan.">
        <Empty title="Layanan ini bukan milikmu atau sudah dihapus.">
          Kembali ke daftar layananmu.
        </Empty>
        <Link className="ws-link" to="/seller-dashboard/services">
          ← Layanan saya
        </Link>
      </SellerFrame>
    );
  return (
    <SellerFrame
      title={serviceId ? "Ubah layanan." : "Layanan baru."}
      description="Layanan yang terbit langsung muncul di marketplace dan dapat dipesan lewat booking Digarsa."
    >
      <Link className="ws-back" to="/seller-dashboard/services">
        ← Layanan saya
      </Link>
      <ServiceForm
        key={serviceId || "new"}
        initial={existing || blank}
        serviceId={serviceId}
        catalog={catalog}
      />
    </SellerFrame>
  );
}

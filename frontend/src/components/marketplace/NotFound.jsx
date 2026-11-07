import Button from "../ui/Button";

export default function NotFound({ type }) {
  return (
    <div className="market-page market-shell market-not-found">
      <span className="market-kicker">404 / DIGARSA</span>
      <h1>{type} tidak ditemukan.</h1>
      <p>
        Alamat ini belum tersedia. Temukan layanan kreatif lainnya di
        marketplace.
      </p>
      <Button to="/marketplace">Kembali ke marketplace →</Button>
    </div>
  );
}

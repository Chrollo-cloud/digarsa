import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useCustomer } from "./useCustomer";
import "./customer.css";

export default function CustomerFrame({ title, description, children }) {
  const { error } = useCustomer();
  useEffect(() => {
    document.title = `${title} — Digarsa`;
  }, [title]);
  return (
    <div className="customer-page">
      <div className="customer-shell">
        <header className="customer-heading">
          <span className="market-kicker">DIGARSA / RUANG PERSONAL</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>
        <nav className="customer-quick-links" aria-label="Navigasi pelanggan">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/marketplace">Marketplace ↗</Link>
          <Link to="/favorites">Favorit</Link>
          <Link to="/cart">Pertimbangan</Link>
          <Link to="/orders">Pesanan</Link>
          <Link to="/messages">Pesan</Link>
          <Link to="/notifications">Notifikasi</Link>
        </nav>
        {error && (
          <p className="customer-warning" role="alert">
            {error}
          </p>
        )}
        {children}
        <p className="customer-demo">
          Demo lokal · Data tersimpan per akun di browser ini. Bukan otorisasi
          server atau transaksi pembayaran.
        </p>
      </div>
    </div>
  );
}

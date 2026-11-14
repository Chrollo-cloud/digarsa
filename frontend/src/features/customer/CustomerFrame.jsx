import { useEffect } from "react";
import { useCustomer } from "./useCustomer";
import "./customer.css";

export default function CustomerFrame({ title, description, children, serverBacked = false, serverBackedNotice }) {
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
        {!serverBacked && error && (
          <p className="customer-warning" role="alert">
            {error}
          </p>
        )}
        {children}
        {serverBacked ? <p className="customer-demo">{serverBackedNotice || "Information on this page is loaded from your Digarsa account."}</p> : <p className="customer-demo">
          Demo lokal · Data tersimpan per akun di browser ini. Bukan otorisasi
          server atau transaksi pembayaran.
        </p>}
      </div>
    </div>
  );
}

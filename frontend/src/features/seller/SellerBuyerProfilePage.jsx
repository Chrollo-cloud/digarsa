import { Link, useParams } from "react-router-dom";
import { Empty } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import ReportAccountButton from "../account/ReportAccountButton";
import "./seller-buyer-profile.css";
export default function SellerBuyerProfilePage() {
  const { customerId } = useParams();

  const { customerProfiles, customers, bookings } = useSeller();

  // Pastikan Buyer memang memiliki pesanan
  // yang dapat dilihat Seller ini.
  const hasOrder = bookings.some(
    (booking) => booking.customerId === customerId,
  );

  const buyer = customerProfiles[customerId];

  if (!hasOrder || !buyer) {
    return (
      <SellerFrame title="Profil Buyer tidak ditemukan.">
        <Empty title="Profil pelanggan tidak tersedia.">
          Profil ini tidak ditemukan pada pesanan Seller-mu.
        </Empty>

        <Link
          className="ws-link"
          to="/seller-dashboard/orders"
        >
          ← Kembali ke Pesanan Masuk
        </Link>
      </SellerFrame>
    );
  }

  const initial = buyer.name?.charAt(0)?.toUpperCase() || "B";

  return (
    <SellerFrame
      title="Profil Buyer."
      description="Informasi pelanggan yang melakukan pemesanan layananmu."
    >
      <Link
        className="ws-back"
        to="/seller-dashboard/orders"
      >
        ← Kembali ke Pesanan Masuk
      </Link>

      <section className="seller-buyer-profile">
        <div className="seller-buyer-profile__header">
          {buyer.avatarUrl ? (
            <img
              src={buyer.avatarUrl}
              alt={`Foto profil ${buyer.name}`}
              className="seller-buyer-profile__avatar"
            />
          ) : (
            <div className="seller-buyer-profile__avatar seller-buyer-profile__initial">
              {initial}
            </div>
          )}

          <div>
            <span className="seller-buyer-profile__label">
              PROFILE
            </span>

            <h2>{buyer.name}</h2>

            <p>Pengguna Digarsa</p>
          </div>
        </div>

        <div className="seller-buyer-profile__details">
          <h3>Informasi Pengguna</h3>

          <div className="seller-buyer-profile__item">
            <span>Nama lengkap</span>
            <strong>{buyer.name}</strong>
          </div>

          <div className="seller-buyer-profile__item">
            <span>ID Pengguna</span>
            <strong>{buyer.id}</strong>
          </div>
        </div>

        <div className="seller-buyer-profile__report">
          <h3>Laporkan Akun</h3>

          <p>
            Jika menemukan aktivitas mencurigakan atau
            pelanggaran, kamu dapat melaporkan akun Buyer ini
            kepada Admin Digarsa.
          </p>

          <ReportAccountButton
            targetAccountId={buyer.id}
            label="Laporkan Akun Pengguna"
          />
        </div>
      </section>
    </SellerFrame>
  );
}
import { useAuth } from "../account/authContext";
import ProfileLayout from "./ProfileLayout";
import PersonalInfoForm from "./PersonalInfoForm";
import BuyerAddressBook from "./BuyerAddressBook";

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <ProfileLayout>
      <div className="personal-profile-grid">
      <section className="personal-account-info" aria-label="Informasi akun">
        <strong>{user.name}</strong>
        <span>{user.email}</span>
        <span>
          {user.createdAt
            ? `Bergabung ${new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(user.createdAt))}`
            : "Tanggal pendaftaran akun lama tidak tercatat."}
        </span>
        <p>
          {user.sellerProfileId
            ? "Seller Profile tersedia untuk persiapan dan review aktivasi. Akun yang sama tetap dapat menggunakan fitur pembeli."
            : "Akun Digarsa reguler. Kamu dapat menyiapkan Seller Profile dari akun yang sama."}
        </p>
      </section>
      <div className="personal-profile-content">
      <PersonalInfoForm key={user.id} user={user} />
      <BuyerAddressBook key={`addresses-${user.id}`} />
      </div>
      </div>
    </ProfileLayout>
  );
}

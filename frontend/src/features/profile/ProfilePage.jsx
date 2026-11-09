import BuyerLocationForm from "../location/BuyerLocationForm";
import { useAuth } from "../account/authContext";
import ProfileLayout from "./ProfileLayout";
import PersonalInfoForm from "./PersonalInfoForm";

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <ProfileLayout>
      <section className="personal-account-info" aria-label="Informasi akun">
        <strong>{user.name}</strong>
        <span>{user.email}</span>
        <span>
          {user.createdAt
            ? `Bergabung ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(user.createdAt))}`
            : "Tanggal pendaftaran akun lama tidak tercatat."}
        </span>
        <p>
          {user.sellerProfileId
            ? "Seller Profile aktif. Akun yang sama tetap dapat mencari dan memesan layanan sebagai pembeli."
            : "Akun Digarsa reguler. Kamu dapat mencari layanan dan mengaktifkan Seller Profile dari akun yang sama."}
        </p>
      </section>
      <PersonalInfoForm key={user.id} user={user} />
      <BuyerLocationForm key={`location-${user.id}`} />
    </ProfileLayout>
  );
}

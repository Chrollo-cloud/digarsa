import { useAuth } from "../account/authContext";
import ProfileLayout from "./ProfileLayout";
import PasswordChangeForm from "./PasswordChangeForm";
import LogoutButton from "./LogoutButton";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <ProfileLayout settings>
      <div className="personal-settings-grid">
      <section className="personal-card settings-intro">
        <span className="market-kicker">KEAMANAN & PRIVASI</span>
        <h2>Aksesmu, dalam kendalimu.</h2>
        <p>Gunakan kata sandi khusus demo. Data akun dan sesi disimpan pada browser ini; belum ada otorisasi server atau sinkronisasi lintas perangkat.</p>
        <dl className="settings-facts">
          <div><dt>Notifikasi</dt><dd>Pesan dan status booking tersedia di dalam aplikasi. Email dan push notification belum tersedia.</dd></div>
          <div><dt>Lokasi privat</dt><dd>Lokasi pencarian dikelola melalui Profil Saya. Koordinat hanya disimpan setelah tindakan dan persetujuanmu.</dd></div>
        </dl>
      </section>
      <div>
      <PasswordChangeForm key={`password-${user.id}`} user={user} />
      <LogoutButton />
      </div>
      </div>
    </ProfileLayout>
  );
}

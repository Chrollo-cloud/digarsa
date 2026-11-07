import { useAuth } from "../account/authContext";
import ProfileLayout from "./ProfileLayout";
import PersonalInfoForm from "./PersonalInfoForm";
import PasswordChangeForm from "./PasswordChangeForm";
import LogoutButton from "./LogoutButton";

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <ProfileLayout settings>
      <PersonalInfoForm key={`info-${user.id}`} user={user} />
      <PasswordChangeForm key={`password-${user.id}`} user={user} />
      <LogoutButton />
    </ProfileLayout>
  );
}

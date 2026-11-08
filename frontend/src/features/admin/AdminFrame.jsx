import WorkspaceFrame from "../workspace/WorkspaceFrame";
import { useAdmin } from "./useAdmin";
import "./admin.css";

const nav = [
  ["/admin", "Ringkasan", true],
  ["/admin/moderation", "Moderasi layanan"],
  ["/admin/orders", "Monitor pesanan"],
  ["/admin/accounts", "Akun"],
];

export default function AdminFrame({ title, description, children }) {
  const { error } = useAdmin();
  return (
    <WorkspaceFrame
      kicker="DIGARSA / ADMIN"
      title={title}
      description={description}
      nav={nav}
      error={error}
    >
      {children}
    </WorkspaceFrame>
  );
}

import WorkspaceFrame from "../workspace/WorkspaceFrame";
import { useAdmin } from "./useAdmin";
import "./admin.css";

const nav = [
  ["/admin", "Overview", true],
  ["/admin/moderation", "Moderasi services"],
  ["/admin/orders", "Monitor orders"],
  ["/admin/accounts", "Akun"],
  ["/admin/payments", "Payment Monitoring"],
  ["/admin/payouts", "Payout Monitoring"],
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

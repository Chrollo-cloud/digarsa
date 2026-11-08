import WorkspaceFrame from "../workspace/WorkspaceFrame";
import { useSeller } from "./useSeller";

export default function SellerFrame({ title, description, children }) {
  const { bookings, error } = useSeller();
  const waiting = bookings.filter((item) => item.status === "Requested").length;
  const nav = [
    ["/seller-dashboard", "Ringkasan", true],
    [
      "/seller-dashboard/orders",
      waiting ? `Pesanan masuk (${waiting})` : "Pesanan masuk",
    ],
    ["/seller-dashboard/services", "Layanan saya"],
    ["/seller-dashboard/messages", "Pesan"],
    ["/seller-dashboard/earnings", "Pendapatan"],
    ["/seller-dashboard/profile", "Profil seller"],
  ];
  return (
    <WorkspaceFrame
      kicker="DIGARSA / SELLER CENTER"
      title={title}
      description={description}
      nav={nav}
      error={error}
    >
      {children}
    </WorkspaceFrame>
  );
}

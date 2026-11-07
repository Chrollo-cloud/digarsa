import { Navigate, Route, Routes } from "react-router-dom";
import AdminOverviewPage from "./AdminOverviewPage";
import AdminModerationPage from "./AdminModerationPage";
import AdminOrdersPage from "./AdminOrdersPage";
import AdminAccountsPage from "./AdminAccountsPage";

// Mounted at /admin/* behind RequireAdmin. Admin permission is independent of the
// seller capability: an admin who is not a seller gets no Seller Center, and a
// seller who is not an admin gets none of this.
export default function AdminCenter() {
  return (
    <Routes>
      <Route index element={<AdminOverviewPage />} />
      <Route path="moderation" element={<AdminModerationPage />} />
      <Route path="orders" element={<AdminOrdersPage />} />
      <Route path="accounts" element={<AdminAccountsPage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

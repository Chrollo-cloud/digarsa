
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../account/authContext";
import { SellerServicesProvider } from "./SellerServicesProvider.jsx";
import SellerOverviewPage from "./SellerOverviewPage";
import SellerOrdersPage from "./SellerOrdersPage";
import SellerOrderDetailPage from "./SellerOrderDetailPage";
import SellerBuyerProfilePage from "./SellerBuyerProfilePage";
import SellerServicesPage from "./SellerServicesPage";
import ServiceFormPage from "./ServiceFormPage";
import SellerProfilePage from "./SellerProfilePage";
import SellerAvailabilityPage from "./SellerAvailabilityPage";
import SellerMessagingPage from "./SellerMessagingPage";
import SellerNotificationsPage from "./SellerNotificationsPage";
import UnsupportedFinancePage from "./UnsupportedFinancePage";

export default function SellerCenter() {
  const { user, logout } = useAuth();
  return (
    <SellerServicesProvider userId={user?.id} onUnauthorized={logout}>
    <Routes>
      <Route index element={<SellerOverviewPage />} />
      <Route path="orders" element={<SellerOrdersPage />} />
      <Route path="orders/:bookingId" element={<SellerOrderDetailPage />} />
      <Route path="buyers/:buyerId" element={<SellerBuyerProfilePage />} />
      <Route path="services" element={<SellerServicesPage />} />
      <Route path="services/new" element={<ServiceFormPage />} />
      <Route path="services/:serviceId/edit" element={<ServiceFormPage />} />
      <Route path="services/:serviceId/availability" element={<SellerAvailabilityPage />} />
      <Route path="earnings" element={<UnsupportedFinancePage title="Earnings unavailable." />} />
      <Route path="wallet" element={<UnsupportedFinancePage title="Wallet unavailable." />} />
      <Route path="withdraw" element={<UnsupportedFinancePage title="Withdrawal unavailable." />} />
      <Route path="payout-history" element={<UnsupportedFinancePage title="Payout history unavailable." />} />

      <Route path="profile" element={<SellerProfilePage />} />
      <Route path="messages" element={<SellerMessagingPage />} />
      <Route path="messages/:conversationId" element={<SellerMessagingPage />} />
      <Route path="notifications" element={<SellerNotificationsPage />} />
      <Route path="*" element={<Navigate to="/seller-dashboard" replace />} />
    </Routes>
    </SellerServicesProvider>
  );
}

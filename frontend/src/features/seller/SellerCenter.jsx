import { Navigate, Route, Routes } from "react-router-dom";
import SellerOverviewPage from "./SellerOverviewPage";
import SellerOrdersPage from "./SellerOrdersPage";
import SellerOrderDetailPage from "./SellerOrderDetailPage";
import SellerServicesPage from "./SellerServicesPage";
import ServiceFormPage from "./ServiceFormPage";
import SellerProfilePage from "./SellerProfilePage";
import EarningsPage from "./EarningsPage";
import SellerAvailabilityPage from "./SellerAvailabilityPage";
import SellerMessagingPage from "./SellerMessagingPage";

// Mounted at /seller-dashboard/* behind the Phase 5 RequireSeller guard.
export default function SellerCenter() {
  return (
    <Routes>
      <Route index element={<SellerOverviewPage />} />
      <Route path="orders" element={<SellerOrdersPage />} />
      <Route path="orders/:bookingId" element={<SellerOrderDetailPage />} />
      <Route path="services" element={<SellerServicesPage />} />
      <Route path="services/new" element={<ServiceFormPage />} />
      <Route path="services/:serviceId/edit" element={<ServiceFormPage />} />
      <Route path="services/:serviceId/availability" element={<SellerAvailabilityPage />} />
      <Route path="earnings" element={<EarningsPage />} />
      <Route path="profile" element={<SellerProfilePage />} />
      <Route path="messages" element={<SellerMessagingPage />} />
      <Route path="messages/:conversationId" element={<SellerMessagingPage />} />
      <Route path="*" element={<Navigate to="/seller-dashboard" replace />} />
    </Routes>
  );
}

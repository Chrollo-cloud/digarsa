import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import PublicLayout from "./components/layout/PublicLayout";
import RouteShell from "./pages/RouteShell";
import HomePage from "./pages/HomePage";
import MarketplacePage from "./pages/marketplace/MarketplacePage";
import ServiceDetailPage from "./pages/marketplace/ServiceDetailPage";
import CreatorProfilePage from "./pages/marketplace/CreatorProfilePage";
import AuthProvider from "./features/account/AuthProvider";
import AuthPage from "./features/account/AuthPage";
import OnboardingPage from "./features/account/OnboardingPage";
import {
  RequireAccount,
  RequireSeller,
  RequireAdmin,
} from "./features/account/Guards";
import DashboardPage from "./features/customer/DashboardPage";
import FavoritesPage from "./features/customer/FavoritesPage";
import CartPage from "./features/customer/CartPage";
import BookingRequestPage from "./features/customer/BookingRequestPage";
import OrdersPage from "./features/customer/OrdersPage";
import BookingDetailPage from "./features/customer/BookingDetailPage";
import ProfilePage from "./features/profile/ProfilePage";
import SettingsPage from "./features/profile/SettingsPage";
import "./features/seller/sellerClient"; // publishes seller services into the shared catalog
import SellerCenter from "./features/seller/SellerCenter";
import AdminCenter from "./features/admin/AdminCenter";
import "./App.css";
import BookingNotifications from "./features/messaging/BookingNotifications";
import ReviewsPage from "./features/reviews/ReviewsPage";
import ReviewFormPage from "./features/reviews/ReviewFormPage";

const CheckoutPage = lazy(() => import("./features/customer/CheckoutPage"));
const PaymentPage = lazy(() => import("./features/customer/PaymentPage"));
const RecoveryPage = lazy(() => import("./features/account/RecoveryPage"));

const NearbyServicesPage = lazy(
  () => import("./features/location/NearbyServicesPage"),
);
const AboutPage = lazy(() => import("./pages/marketing/AboutPage"));
const HowItWorksPage = lazy(() => import("./pages/marketing/HowItWorksPage"));
const publicPageLoading = (
  <p className="container route-shell" role="status">
    Memuat halaman…
  </p>
);

const InboxPage = lazy(() => import("./features/messaging/InboxPage"));
const ConversationPage = lazy(
  () => import("./features/messaging/ConversationPage"),
);
const NotificationsPage = lazy(
  () => import("./features/messaging/NotificationsPage"),
);

function MessagingLoading({ children }) {
  return (
    <Suspense
      fallback={
        <p className="container route-shell" role="status">
          Memuat ruang personal…
        </p>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BookingNotifications />
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route
              path="/register"
              element={<AuthPage key="register" register />}
            />
            <Route path="/forgot-password" element={<Suspense fallback={publicPageLoading}><RecoveryPage /></Suspense>} />
            <Route element={<RequireAccount />}>
              <Route path="/become-a-creator" element={<OnboardingPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/saved"
                element={<Navigate to="/favorites" replace />}
              />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/booking" element={<Navigate to="/orders" replace />} />
              <Route path="/checkout" element={<Suspense fallback={publicPageLoading}><CheckoutPage /></Suspense>} />
              <Route path="/payment/:bookingId" element={<Suspense fallback={publicPageLoading}><PaymentPage /></Suspense>} />
              <Route
                path="/booking/:serviceId"
                element={<BookingRequestPage />}
              />
              <Route
                path="/orders/:bookingId"
                element={<BookingDetailPage />}
              />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/review/:bookingId" element={<ReviewFormPage />} />
              <Route
                path="/messages"
                element={
                  <MessagingLoading>
                    <InboxPage />
                  </MessagingLoading>
                }
              />
              <Route
                path="/messages/:conversationId"
                element={
                  <MessagingLoading>
                    <ConversationPage />
                  </MessagingLoading>
                }
              />
              <Route
                path="/notifications"
                element={
                  <MessagingLoading>
                    <NotificationsPage />
                  </MessagingLoading>
                }
              />
              <Route element={<RequireSeller />}>
                <Route path="/seller-dashboard/*" element={<SellerCenter />} />
              </Route>
              <Route element={<RequireAdmin />}>
                <Route path="/admin/*" element={<AdminCenter />} />
              </Route>
            </Route>
            <Route
              path="/nearby"
              element={
                <Suspense fallback={publicPageLoading}>
                  <NearbyServicesPage />
                </Suspense>
              }
            />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/service/:id" element={<ServiceDetailPage />} />
            <Route path="/seller/:id" element={<CreatorProfilePage />} />
            <Route
              path="/about"
              element={
                <Suspense fallback={publicPageLoading}>
                  <AboutPage />
                </Suspense>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <Suspense fallback={publicPageLoading}>
                  <HowItWorksPage />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <RouteShell title="Halaman tidak ditemukan" label="404" />
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

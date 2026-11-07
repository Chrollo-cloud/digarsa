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
import AccountShell from "./features/account/AccountShell";
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
import "./App.css";

const pages = [
  ["/how-it-works", "Cara Kerja", "HOW IT WORKS"],
  ["/about", "Tentang Digarsa", "ABOUT"],
];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route
              path="/register"
              element={<AuthPage key="register" register />}
            />
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
              <Route
                path="/booking/:serviceId"
                element={<BookingRequestPage />}
              />
              <Route
                path="/orders/:bookingId"
                element={<BookingDetailPage />}
              />
              <Route path="/orders" element={<OrdersPage />} />
              <Route
                path="/messages"
                element={<AccountShell title="Pesan" />}
              />
              <Route element={<RequireSeller />}>
                <Route
                  path="/seller-dashboard/*"
                  element={<AccountShell title="Seller Center" seller />}
                />
              </Route>
              <Route element={<RequireAdmin />}>
                <Route
                  path="/admin"
                  element={<AccountShell title="Admin Dashboard" />}
                />
              </Route>
            </Route>
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/service/:id" element={<ServiceDetailPage />} />
            <Route path="/seller/:id" element={<CreatorProfilePage />} />
            {pages.map(([path, title, label]) => (
              <Route
                key={path}
                path={path}
                element={<RouteShell title={title} label={label} />}
              />
            ))}
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

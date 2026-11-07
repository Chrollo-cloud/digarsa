import { Navigate, Outlet, useLocation } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuth } from "./authContext";
import { ADMIN_PERMISSION } from "./demoStore";

export function RequireAccount() {
  const { user } = useAuth();
  const { pathname, search, hash } = useLocation();
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      to={`/login?returnTo=${encodeURIComponent(pathname + search + hash)}`}
      replace
    />
  );
}
export function RequireSeller() {
  const { user } = useAuth();
  return user?.capabilities.includes("seller") ? (
    <Outlet />
  ) : (
    <Navigate to="/become-a-creator" replace />
  );
}
export function RequireAdmin() {
  const { user } = useAuth();
  return user?.permissions.includes(ADMIN_PERMISSION) ? (
    <Outlet />
  ) : (
    <div className="container route-shell">
      <h1 className="type-heading">Akses terbatas.</h1>
      <p>Halaman ini memerlukan izin admin internal.</p>
      <Button to="/dashboard">Kembali ke akun</Button>
    </div>
  );
}

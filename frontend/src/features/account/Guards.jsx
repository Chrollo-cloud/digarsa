import { Navigate, Outlet, useLocation } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuth } from "./authContext";
import { ADMIN_PERMISSION } from "./demoStore";

export function RequireAccount() {
  const { user, status, retrySession } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (status === "loading") return <p className="container route-shell" role="status">Checking your session…</p>;
  if (status === "unavailable") return <div className="container route-shell"><h1 className="type-heading">Your session could not be checked.</h1><p>Reconnect to Digarsa and try again.</p><Button onClick={retrySession}>Retry</Button></div>;
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
  return user?.capabilities?.includes("seller") ? (
    <Outlet />
  ) : (
    <Navigate to="/become-a-creator" replace />
  );
}
export function RequireAdmin() {
  const { user } = useAuth();
  return user?.permissions?.includes(ADMIN_PERMISSION) ? (
    <Outlet />
  ) : (
    <div className="container route-shell">
      <h1 className="type-heading">Restricted access.</h1>
      <p>This page requires internal admin permission.</p>
      <Button to="/dashboard">Back to account</Button>
    </div>
  );
}

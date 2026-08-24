import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../stores/auth";

export function ProtectedRoute() {
  const { ready, user } = useAuth();
  if (!ready) {
    return <div className="p-10 text-sm text-steel">Restoring session…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

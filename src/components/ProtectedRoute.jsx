import { Navigate, useLocation } from "react-router-dom";
import { Alert, Button, Spin } from "antd";
import { useAuth } from "../services/authContext";
import { canAccessPage } from "../utils/permissions";

export default function ProtectedRoute({
  children,
}) {
  const { user, loading, error, retry } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Spin fullscreen />;
  if (error) return <Alert type="error" title={error} action={<Button onClick={retry}>Retry</Button>} />;
  if (!user) return <Navigate to="/" replace />;
  if (user.mustChangePassword && pathname !== "/profile") return <Navigate to="/profile" replace />;
  if (!canAccessPage(user.role, pathname)) return <Navigate to="/dashboard" replace />;
  return children;
}

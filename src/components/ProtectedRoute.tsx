import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { hasRole, useSession } from './Layout';

interface ProtectedRouteProps {
  roles?: string[];
  children: ReactNode;
}

/** 前端守卫只影响体验，真正安全在 Functions */
export function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 flex flex-col gap-3">
        <div className="bg-gray-200 dark:bg-gray-800 h-14 w-full rounded-card animate-pulse" />
        <div className="bg-gray-200 dark:bg-gray-800 h-14 w-full rounded-card animate-pulse" />
        <div className="bg-gray-200 dark:bg-gray-800 h-14 w-2/3 rounded-card animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.some((r) => hasRole(session, r))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

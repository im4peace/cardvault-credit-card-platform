import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '../types';
import { useAuth } from './AuthContext';

export const homeFor = (role: Role): string => (role === 'CREDIT_OFFICER' ? '/officer' : '/customer');

export function RequireRole({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

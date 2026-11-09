import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { homeFor, type DeliveryRole } from '../lib/roles'
import Splash from './Splash'

/** Route guard. The UI check is for navigation only: real access is enforced by RLS / server functions. */
export default function ProtectedRoute({ allow }: { allow: DeliveryRole[] }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!role) return <Navigate to="/no-access" replace />
  if (!allow.includes(role)) return <Navigate to={homeFor(role)} replace />
  return <Outlet />
}

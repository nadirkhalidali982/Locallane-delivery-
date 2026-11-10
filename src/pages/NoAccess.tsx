import { Navigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { homeFor } from '../lib/roles'
import Splash from '../components/Splash'
import RiderApplication from '../components/rider/RiderApplication'

export default function NoAccess() {
  const { session, role, loading, roleError, signOut, refreshRole } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (role) return <Navigate to={homeFor(role)} replace />

  return (
    <div className="min-h-dvh bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {roleError ? (
            <>
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Could not check your access: {roleError}</p>
              <button onClick={() => void refreshRole()} className="mt-4 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
            </>
          ) : (
            <RiderApplication />
          )}
        </div>
        <p className="px-2 text-sm text-slate-600">
          Signed in as <b>{session.user.email}</b>. Staff or managers: ask a Delivery Manager to add this email.
        </p>
        <button onClick={() => void signOut()} className="px-2 text-sm font-semibold text-brand-700 hover:underline">Sign out</button>
      </div>
    </div>
  )
}

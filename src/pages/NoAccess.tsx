import { Navigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { homeFor } from '../lib/roles'
import Splash from '../components/Splash'

export default function NoAccess() {
  const { session, role, loading, roleError, signOut, refreshRole } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  if (role) return <Navigate to={homeFor(role)} replace />

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-ink-900">Waiting for access</h1>
        {roleError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Could not check your access: {roleError}
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            You are signed in as <strong>{session.user.email}</strong>, but you are not on the delivery team yet. Ask a Delivery
            Manager to add this email, then check again.
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button onClick={() => void refreshRole()} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Check again
          </button>
          <button onClick={() => void signOut()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

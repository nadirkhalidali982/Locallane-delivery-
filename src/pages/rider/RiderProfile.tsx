import { useAuth } from '../../store/authStore'

export default function RiderProfile() {
  const { name, session, signOut } = useAuth()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Profile</h1>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-800">{name || 'Rider'}</p>
        <p className="text-sm text-slate-600">{session?.user.email}</p>
      </div>
      <button onClick={() => void signOut()} className="w-full rounded-xl border border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-700">
        Sign out
      </button>
    </div>
  )
}

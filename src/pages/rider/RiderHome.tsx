import { useAuth } from '../../store/authStore'

export default function RiderHome() {
  const { name, session } = useAuth()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Hi, {name || session?.user.email}</h1>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-800">Go online to get delivery offers</p>
        <p className="mt-1 text-sm text-slate-600">Online/offline and nearby offers arrive in Milestone 3 and 4.</p>
        <button disabled className="mt-4 w-full rounded-xl bg-slate-200 py-4 text-base font-bold text-slate-500">
          Go online (coming soon)
        </button>
      </div>
    </div>
  )
}

import { CheckCircle2, CircleDashed } from 'lucide-react'
import { useAuth } from '../../store/authStore'
import { ROLE_LABEL } from '../../lib/roles'

export default function Overview() {
  const { name, role, session } = useAuth()
  const items = [
    { done: true, title: 'Signed in and role verified on the server', detail: role ? ROLE_LABEL[role] : '' },
    { done: false, title: 'Orders feed from LocalLane shops', detail: 'Milestone 2' },
    { done: false, title: 'Rider assignment and offers', detail: 'Milestone 3' },
    { done: false, title: 'Rider approvals and documents', detail: 'Milestone 4' },
  ]
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Hello, {name || session?.user.email}</h1>
      <p className="mt-1 text-sm text-slate-600">Delivery operations for LocalLane orders.</p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
        {items.map((i) => (
          <li key={i.title} className="flex items-center gap-3 px-4 py-3.5">
            {i.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" aria-label="Done" />
            ) : (
              <CircleDashed className="h-5 w-5 shrink-0 text-slate-400" aria-label="Not built yet" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{i.title}</p>
              <p className="text-xs text-slate-500">{i.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

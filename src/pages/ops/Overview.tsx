import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/authStore'
import { ROLE_LABEL } from '../../lib/roles'
import { rpc, type JobRow } from '../../lib/api'
import { useLive } from '../../hooks/useLive'

export default function Overview() {
  const { name, role, session } = useAuth()
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { setJobs(await rpc<JobRow[]>('delivery_jobs_list')); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])
  useLive(load, ['delivery_jobs'], 30000)

  const n = (f: (j: JobRow) => boolean) => (jobs ? jobs.filter(f).length : '–')
  const tiles = [
    { label: 'Needs check', to: '/ops/orders', v: n((j) => j.job_status === 'pending_verification') },
    { label: 'Ready to dispatch', to: '/ops/dispatch', v: n((j) => j.job_status === 'ready_for_dispatch' || j.job_status === 'offering') },
    { label: 'With riders', to: '/ops/dispatch', v: n((j) => j.job_status === 'assigned' || j.job_status === 'picked_up') },
    { label: 'Delivered', to: '/ops/orders', v: n((j) => j.job_status === 'delivered') },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Hello, {name || session?.user.email}</h1>
      <p className="mt-1 text-sm text-slate-600">{role ? ROLE_LABEL[role] : ''} · Delivery operations for LocalLane orders</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-500">
            <p className="text-3xl font-bold text-ink-900">{t.v}</p>
            <p className="mt-1 text-sm text-slate-600">{t.label}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        Orders show up here when a shop marks them packed and chooses LocalLane Delivery.
      </p>
    </div>
  )
}

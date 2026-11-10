import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../store/authStore'
import { useLive } from '../../hooks/useLive'
import { rpc, type JobRow, type JobStatus } from '../../lib/api'
import JobCard from '../../components/JobCard'
import { cn } from '../../lib/cn'

export interface Tab { label: string; statuses: JobStatus[] | 'all' }
const TABLES = ['delivery_jobs', 'delivery_offers']

export default function JobsPage({ title, hint, tabs }: { title: string; hint: string; tabs: Tab[] }) {
  const role = useAuth((s) => s.role)
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(0)

  const load = useCallback(async () => {
    try {
      await rpc('delivery_expire_offers')
      setJobs(await rpc<JobRow[]>('delivery_jobs_list'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
    }
  }, [])
  useLive(load, TABLES)
  useEffect(() => { void load() }, [load])

  const t = tabs[tab]
  const rows = (jobs ?? []).filter((j) => t.statuses === 'all' || t.statuses.includes(j.job_status))
  const count = (x: Tab) => (jobs ?? []).filter((j) => x.statuses === 'all' || x.statuses.includes(j.job_status)).length

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
        <p className="text-sm text-slate-600">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x, i) => (
          <button key={x.label} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
            className={cn('rounded-full px-4 py-2 text-sm font-semibold', i === tab ? 'bg-ink-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200')}>
            {x.label} <span className="opacity-70">{jobs ? count(x) : ''}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!jobs && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {jobs && rows.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">Nothing here right now.</p>}
      <div className="space-y-3">
        {role && rows.map((j) => <JobCard key={j.job_id} job={j} role={role} onChanged={() => void load()} />)}
      </div>
    </div>
  )
}

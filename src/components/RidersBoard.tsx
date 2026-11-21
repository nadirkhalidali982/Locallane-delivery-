import { useCallback, useEffect, useState } from 'react'
import { rpc, type LiveRider } from '../lib/api'
import { ago } from '../lib/format'
import { useLive } from '../hooks/useLive'
import { cn } from '../lib/cn'

const LABEL: Record<LiveRider['state'], string> = { available: 'Available', busy: 'On delivery', offered: 'Has an offer', gps_old: 'GPS old', offline: 'Offline' }
const TONE: Record<LiveRider['state'], string> = {
  available: 'bg-emerald-100 text-emerald-800', busy: 'bg-brand-100 text-brand-800', offered: 'bg-violet-100 text-violet-800', gps_old: 'bg-amber-100 text-amber-800', offline: 'bg-slate-200 text-slate-600',
}

/** Who can take an order right now. Visible to staff, managers and admins. */
export default function RidersBoard() {
  const [riders, setRiders] = useState<LiveRider[] | null>(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(async () => { try { setRiders(await rpc<LiveRider[]>('delivery_riders_live')) } catch { setRiders([]) } }, [])
  useEffect(() => { void load() }, [load])
  useLive(load, ['delivery_offers', 'delivery_jobs'], 30000)

  const count = (s: LiveRider['state']) => (riders ?? []).filter((r) => r.state === s).length
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left" aria-expanded={open}>
        <span className="font-bold text-ink-900">Riders now</span>
        <span className="flex flex-wrap gap-2 text-xs font-semibold">
          {(['available', 'offered', 'busy', 'gps_old', 'offline'] as const).map((s) => <span key={s} className={cn('rounded-full px-2.5 py-0.5', TONE[s])}>{LABEL[s]} {count(s)}</span>)}
        </span>
      </button>
      {open && (
        <ul className="mt-3 divide-y divide-slate-100">
          {(riders ?? []).length === 0 && <li className="py-3 text-sm text-slate-600">No approved riders yet.</li>}
          {(riders ?? []).map((r) => (
            <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span><b>{r.full_name || 'Rider'}</b> <span className="text-slate-500">{r.zones ? '· ' + r.zones : '· no zone'}</span></span>
              <span className="flex items-center gap-2">
                {r.last_seen && <span className="text-xs text-slate-500">{ago(r.last_seen)}</span>}
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE[r.state])}>{LABEL[r.state]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

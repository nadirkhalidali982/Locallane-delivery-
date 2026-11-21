import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/authStore'
import { ROLE_LABEL } from '../../lib/roles'
import { rpc, type Dashboard } from '../../lib/api'
import { ago } from '../../lib/format'
import { useLive } from '../../hooks/useLive'
import { cn } from '../../lib/cn'

const ISSUE: Record<string, { text: string; to: string; tone: string }> = {
  needs_check: { text: 'Needs a check', to: '/ops/orders', tone: 'bg-amber-100 text-amber-800' },
  no_rider: { text: 'No rider found', to: '/ops/dispatch', tone: 'bg-red-100 text-red-800' },
  failed: { text: 'Delivery failed', to: '/ops/dispatch', tone: 'bg-red-100 text-red-800' },
  otp_locked: { text: 'Delivery code locked', to: '/ops/dispatch', tone: 'bg-amber-100 text-amber-800' },
  late_pickup: { text: 'Rider has not picked up (30+ min)', to: '/ops/dispatch', tone: 'bg-amber-100 text-amber-800' },
  late_delivery: { text: 'Delivery taking long (45+ min)', to: '/ops/dispatch', tone: 'bg-amber-100 text-amber-800' },
}

export default function Overview() {
  const { name, role, session } = useAuth()
  const [d, setD] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { setD(await rpc<Dashboard>('delivery_dashboard')); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])
  useLive(load, ['delivery_jobs', 'delivery_offers'], 30000)

  const t = d?.today
  const tiles = [
    { label: 'Orders today', v: t?.orders, to: '/ops/orders', tone: '' },
    { label: 'Waiting for a rider', v: t?.waiting, to: '/ops/dispatch', tone: t && t.waiting > 0 ? 'ring-amber-400' : '' },
    { label: 'On the way', v: t?.active, to: '/ops/dispatch', tone: '' },
    { label: 'Delivered today', v: t?.delivered, to: '/ops/orders', tone: '' },
    { label: 'Failed today', v: t?.failed, to: '/ops/dispatch', tone: t && t.failed > 0 ? 'ring-red-400' : '' },
    { label: 'Needs a check', v: t?.attention, to: '/ops/orders', tone: t && t.attention > 0 ? 'ring-amber-400' : '' },
  ]
  const r = d?.riders ?? {}
  const rid = [
    { k: 'available', l: 'Available', c: 'bg-emerald-100 text-emerald-800' }, { k: 'offered', l: 'Has an offer', c: 'bg-violet-100 text-violet-800' },
    { k: 'busy', l: 'On delivery', c: 'bg-brand-100 text-brand-800' }, { k: 'gps_old', l: 'GPS old', c: 'bg-amber-100 text-amber-800' }, { k: 'offline', l: 'Offline', c: 'bg-slate-200 text-slate-600' },
  ] as const

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Hello, {name || session?.user.email}</h1>
        <p className="text-sm text-slate-600">{role ? ROLE_LABEL[role] : ''} · Delivery operations</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {d && d.zones.length === 0 && (
        <Link to="/ops/zones" className="block rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">Set your launch area first: create a city and a delivery zone. Tap here.</Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((x) => (
          <Link key={x.label} to={x.to} className={cn('rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-500', x.tone && 'ring-2 ' + x.tone)}>
            <p className="text-3xl font-bold text-ink-900">{x.v ?? '-'}</p>
            <p className="mt-1 text-sm text-slate-600">{x.label}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between"><h2 className="font-bold text-ink-900">Riders</h2><Link to="/ops/dispatch" className="text-sm font-semibold text-brand-700">Open Dispatch</Link></div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          {rid.map((x) => <span key={x.k} className={cn('rounded-full px-3 py-1', x.c)}>{x.l} {r[x.k] ?? 0}</span>)}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-bold text-ink-900">Needs attention</h2>
        {d && d.issues.length === 0 && <p className="mt-2 text-sm text-emerald-700">All clear. Nothing needs you right now.</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {(d?.issues ?? []).map((i) => {
            const m = ISSUE[i.kind]
            return (
              <li key={i.job_id + i.kind}>
                <Link to={m.to} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><b>Order #{i.order_no}</b> <span className="text-slate-500">· {i.shop}</span></span>
                  <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{ago(i.since)}</span><span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', m.tone)}>{m.text}</span></span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {d && d.zones.length > 0 && (
        <section className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <h2 className="px-4 pt-4 font-bold text-ink-900">Zones today</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">Zone</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Waiting</th><th className="px-3 py-2">Active</th><th className="px-3 py-2">Done</th><th className="px-3 py-2">Failed</th><th className="px-3 py-2">Riders online</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.zones.map((z) => (
                <tr key={z.zone_id}>
                  <td className="px-4 py-2.5"><b>{z.zone}</b> <span className="text-xs text-slate-500">{z.city}{z.status !== 'active' ? ' · ' + z.status : ''}</span></td>
                  <td className="px-3 py-2.5">{z.jobs_today}</td><td className="px-3 py-2.5">{z.waiting}</td><td className="px-3 py-2.5">{z.active}</td>
                  <td className="px-3 py-2.5">{z.delivered}</td><td className="px-3 py-2.5">{z.failed}</td><td className="px-3 py-2.5 font-semibold">{z.riders_online}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

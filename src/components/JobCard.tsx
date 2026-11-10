import { useState } from 'react'
import { Loader2, MapPin, Phone, Store } from 'lucide-react'
import Pill from './Pill'
import { rpc, type JobEvent, type JobRow, type NearbyRider } from '../lib/api'
import { EVENT_LABEL, ago, money } from '../lib/format'
import type { DeliveryRole } from '../lib/roles'
import { cn } from '../lib/cn'

const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50'

export default function JobCard({ job, role, onChanged }: { job: JobRow; role: DeliveryRole; onChanged: () => void }) {
  const canManage = role === 'super_admin' || role === 'manager'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ask, setAsk] = useState<'reject' | 'unassign' | null>(null)
  const [reason, setReason] = useState('')
  const [riders, setRiders] = useState<NearbyRider[] | null>(null)
  const [events, setEvents] = useState<JobEvent[] | null>(null)

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setBusy(false)
  }

  const s = job.job_status
  const dispatchable = s === 'ready_for_dispatch' || s === 'offering'

  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-ink-900">Order #{job.order_no}</h3>
          <p className="text-xs text-slate-500">{ago(job.created_at)}</p>
        </div>
        <Pill status={s} />
      </header>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <p className="flex items-start gap-2"><Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span><b>{job.shop_name}</b><br />{job.shop_address || 'No shop address'}</span></p>
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span><b>{job.customer_name}</b><br />{job.address || 'No address'}</span></p>
          <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" aria-hidden /><a className="text-brand-700 underline" href={'tel:' + job.customer_phone}>{job.customer_phone}</a></p>
        </div>
        <div>
          <ul className="list-inside list-disc text-slate-700">
            {job.items.map((i, k) => (
              <li key={k}>{i.name}{i.size ? ` (${i.size})` : ''} × {i.qty}</li>
            ))}
          </ul>
          <p className="mt-2 font-semibold text-slate-800">
            {money(job.total)}{' '}
            <span className={cn('ml-1 rounded px-1.5 py-0.5 text-xs', job.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
              {job.payment_status === 'paid' ? 'Paid' : job.payment_method.toUpperCase() + ' to collect'}
            </span>
          </p>
          {job.note && <p className="mt-1 text-xs text-slate-500">Note: {job.note}</p>}
          {job.rider_name && <p className="mt-1 text-xs text-slate-600">Rider: <b>{job.rider_name}</b></p>}
          {job.failure_reason && <p className="mt-1 text-xs text-red-700">Reason: {job.failure_reason}</p>}
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{msg}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {s === 'pending_verification' && (
          <>
            <button className={cn(btn, 'bg-brand-600 text-white hover:bg-brand-700')} disabled={busy}
              onClick={() => void run(() => rpc('delivery_verify_job', { p_job: job.job_id, p_ok: true }))}>
              Verify order
            </button>
            <button className={cn(btn, 'border border-slate-300 text-slate-700')} disabled={busy} onClick={() => setAsk(ask === 'reject' ? null : 'reject')}>Reject</button>
          </>
        )}
        {dispatchable && (
          <>
            <button className={cn(btn, 'bg-brand-600 text-white hover:bg-brand-700')} disabled={busy}
              onClick={() => void run(async () => {
                const r = await rpc<{ ok: boolean; message?: string }>('delivery_offer_job', { p_job: job.job_id })
                setMsg(r.ok ? 'Offer sent to the nearest rider.' : r.message || 'Could not send the offer')
              })}>
              Find nearest rider
            </button>
            {canManage && (
              <button className={cn(btn, 'border border-slate-300 text-slate-700')} disabled={busy}
                onClick={() => void run(async () => setRiders(await rpc<NearbyRider[]>('delivery_nearby_riders', { p_job: job.job_id })))}>
                Choose rider
              </button>
            )}
          </>
        )}
        {s === 'failed' && canManage && job.picked_up_at && (
          <button className={cn(btn, 'bg-brand-600 text-white hover:bg-brand-700')} disabled={busy}
            onClick={() => void run(() => rpc('delivery_requeue_failed', { p_job: job.job_id }))}>
            Parcel is back: send again
          </button>
        )}
        {s === 'picked_up' && canManage && job.otp_locked && (
          <button className={cn(btn, 'border border-slate-300 text-slate-700')} disabled={busy}
            onClick={() => void run(() => rpc('delivery_reset_otp', { p_job: job.job_id }))}>
            Unlock delivery code
          </button>
        )}
        {s === 'assigned' && canManage && (
          <button className={cn(btn, 'border border-slate-300 text-slate-700')} disabled={busy} onClick={() => setAsk(ask === 'unassign' ? null : 'unassign')}>Unassign</button>
        )}
        <button className={cn(btn, 'text-brand-700')} disabled={busy}
          onClick={() => void run(async () => setEvents(events ? null : await rpc<JobEvent[]>('delivery_job_events_list', { p_job: job.job_id })))}>
          {events ? 'Hide history' : 'History'}
        </button>
        {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-slate-400" aria-label="Working" />}
      </div>

      {ask && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <button className={cn(btn, 'bg-red-600 text-white')} disabled={busy || reason.trim().length < 3}
            onClick={() => void run(async () => {
              if (ask === 'reject') await rpc('delivery_verify_job', { p_job: job.job_id, p_ok: false, p_note: reason })
              else await rpc('delivery_unassign', { p_job: job.job_id, p_reason: reason })
              setAsk(null)
              setReason('')
            })}>
            Confirm
          </button>
        </div>
      )}

      {riders && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          {riders.length === 0 ? (
            <p className="text-sm text-slate-600">No online rider within range.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {riders.map((r) => (
                <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><b>{r.full_name || 'Rider'}</b> <span className="text-slate-500">{r.km != null ? r.km.toFixed(1) + ' km' : 'distance unknown'}{r.tried ? ' · declined before' : ''}</span></span>
                  <span className="flex gap-2">
                    <button className={cn(btn, 'border border-slate-300')} disabled={busy}
                      onClick={() => void run(async () => {
                        const x = await rpc<{ ok: boolean; message?: string }>('delivery_offer_job', { p_job: job.job_id, p_rider: r.user_id })
                        setMsg(x.ok ? 'Offer sent.' : x.message || 'Could not send the offer')
                        setRiders(null)
                      })}>Offer</button>
                    <button className={cn(btn, 'bg-ink-900 text-white')} disabled={busy}
                      onClick={() => void run(async () => { await rpc('delivery_assign_manual', { p_job: job.job_id, p_rider: r.user_id }); setRiders(null) })}>Assign now</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {events && (
        <ol className="mt-3 space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
          {events.map((e) => (
            <li key={e.id}><b>{EVENT_LABEL[e.action] || e.action}</b>{e.actor_name ? ' · ' + e.actor_name : ''} · {ago(e.created_at)}{e.note && e.action !== 'offered' && e.action !== 'accepted' && !e.note.match(/^[0-9a-f-]{36}$/) && e.action !== 'offer_expired' && e.action !== 'offer_rejected' ? ' · ' + e.note : ''}</li>
          ))}
        </ol>
      )}
    </article>
  )
}

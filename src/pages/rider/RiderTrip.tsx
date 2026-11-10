import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Loader2, Navigation, Phone } from 'lucide-react'
import { rpc, type RiderJob } from '../../lib/api'
import { REASON_LABEL, mapsDir, money } from '../../lib/format'
import { useLive } from '../../hooks/useLive'
import { cn } from '../../lib/cn'

const TripMap = lazy(() => import('../../components/rider/TripMap'))
const field = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base'
const BEFORE = ['shop_not_ready', 'cannot_reach_shop', 'other']
const AFTER = ['customer_unreachable', 'wrong_address', 'refused', 'other']

export default function RiderTrip() {
  const [job, setJob] = useState<RiderJob | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [otp, setOtp] = useState('')
  const [cashOk, setCashOk] = useState(false)
  const [issue, setIssue] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try { setJob((await rpc<RiderJob[]>('rider_my_jobs'))[0] ?? null); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])
  useLive(load, ['delivery_jobs'], 20000)

  async function act(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    setBusy(false)
    void load()
  }

  if (job === undefined) return error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-500">Loading…</p>
  if (!job) return (
    <div className="space-y-3">
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}
      <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">No active delivery. Accept an offer to start.</p>
    </div>
  )

  const shopPin: [number, number] | null = job.shop_lat != null && job.shop_lng != null ? [job.shop_lat, job.shop_lng] : null
  const custPin: [number, number] | null = job.cust_lat != null && job.cust_lng != null ? [job.cust_lat, job.cust_lng] : null
  const pickedUp = job.job_status === 'picked_up'
  const reasons = pickedUp ? AFTER : BEFORE

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Order #{job.order_no}</h1>

      {(shopPin || custPin) && (
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-slate-200" />}>
          <TripMap shop={shopPin} customer={custPin} />
        </Suspense>
      )}

      <section className={cn('rounded-2xl bg-white p-5 ring-1', pickedUp ? 'opacity-70 ring-slate-200' : 'ring-2 ring-brand-500')}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Pickup</p>
        <p className="mt-1 font-bold text-slate-800">{job.shop_name}</p>
        <p className="text-sm text-slate-600">{job.shop_address || 'No address'}</p>
        <div className="mt-3 flex gap-2">
          {(job.shop_address || shopPin) && <a className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white" href={mapsDir(job.shop_address, shopPin)} target="_blank" rel="noreferrer"><Navigation className="h-5 w-5" aria-hidden />Navigate</a>}
          {job.shop_phone && <a className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700" href={'tel:' + job.shop_phone}><Phone className="h-5 w-5" aria-hidden />Call</a>}
        </div>
        <ul className="mt-3 list-inside list-disc text-sm text-slate-700">
          {job.items.map((i, k) => <li key={k}>{i.name}{i.size ? ` (${i.size})` : ''} × {i.qty}</li>)}
        </ul>
        {job.note && <p className="mt-2 text-sm text-slate-500">Note: {job.note}</p>}
        {!pickedUp && (
          <button disabled={busy} onClick={() => void act(async () => { await rpc('rider_confirm_pickup', { p_job: job.job_id }); setMsg('Pickup confirmed. The customer can see it is on the way.') })}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-4 text-lg font-bold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} I have the parcel
          </button>
        )}
      </section>

      <section className={cn('rounded-2xl bg-white p-5 ring-1', pickedUp ? 'ring-2 ring-brand-500' : 'ring-slate-200')}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Deliver</p>
        <p className="mt-1 font-bold text-slate-800">{job.customer_name}</p>
        <p className="text-sm text-slate-600">{job.address || 'No address'}</p>
        {!custPin && <p className="mt-1 text-xs text-slate-500">The customer has not shared an exact pin. Use the address.</p>}
        <div className="mt-3 flex gap-2">
          {(job.address || custPin) && <a className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white" href={mapsDir(job.address, custPin)} target="_blank" rel="noreferrer"><Navigation className="h-5 w-5" aria-hidden />Navigate</a>}
          <a className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700" href={'tel:' + job.customer_phone}><Phone className="h-5 w-5" aria-hidden />Call</a>
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {job.collect_amount > 0 ? `Collect ${money(job.collect_amount)} cash from the customer.` : 'Already paid. Do not collect cash.'}
        </p>

        {pickedUp && (
          <form className="mt-4 space-y-3" onSubmit={(e) => {
            e.preventDefault()
            void act(async () => {
              const r = await rpc<{ result: string; attempts_left?: number; due?: number; earned?: number }>('rider_complete_delivery', { p_job: job.job_id, p_otp: otp, p_cash: job.collect_amount > 0 ? job.collect_amount : 0 })
              if (r.result === 'delivered') { setMsg(`Delivered. You earned ${money(r.earned ?? 0)}.`); setOtp(''); setCashOk(false) }
              else if (r.result === 'cash_mismatch') setError(`Cash due is ${money(r.due ?? 0)}. Do not complete until the exact amount is collected.`)
              else if (r.result === 'locked') setError('Too many wrong codes. Call your manager to unlock.')
              else setError(`Wrong code. ${r.attempts_left ?? 0} tries left.`)
            })
          }}>
            <label className="block text-sm font-semibold text-slate-700">Ask the customer for their 4-digit delivery code
              <input className={cn(field, 'mt-1 text-center text-2xl tracking-[0.5em]')} inputMode="numeric" autoComplete="one-time-code" maxLength={4}
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            {job.collect_amount > 0 && (
              <label className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
                <input type="checkbox" className="h-5 w-5" checked={cashOk} onChange={(e) => setCashOk(e.target.checked)} />
                I collected {money(job.collect_amount)} cash
              </label>
            )}
            <button type="submit" disabled={busy || otp.length !== 4 || (job.collect_amount > 0 && !cashOk)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-4 text-lg font-bold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} Complete delivery
            </button>
          </form>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <button onClick={() => setIssue(!issue)} className="text-sm font-semibold text-red-700">{pickedUp ? 'Delivery failed?' : 'Cannot pick up? Give the job back'}</button>
        {issue && (
          <div className="mt-3 space-y-3">
            <select className={field} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
              <option value="">Choose a reason</option>
              {reasons.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
            <input className={field} placeholder="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <button disabled={busy || !reason} className="w-full rounded-xl bg-red-600 py-3.5 font-bold text-white disabled:opacity-50"
              onClick={() => void act(async () => {
                if (pickedUp) await rpc('rider_fail_delivery', { p_job: job.job_id, p_reason: reason, p_note: note || null })
                else await rpc('rider_report_issue', { p_job: job.job_id, p_kind: reason, p_note: note || null })
                setIssue(false); setReason(''); setNote('')
                setMsg(pickedUp ? 'Reported. Your manager will follow up.' : 'The job went back to dispatch.')
              })}>Confirm</button>
          </div>
        )}
      </section>
    </div>
  )
}

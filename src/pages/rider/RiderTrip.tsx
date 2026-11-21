import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, Navigation, Phone } from 'lucide-react'
import { rpc, type RiderJob } from '../../lib/api'
import { REASON_LABEL, mapsDir, money } from '../../lib/format'
import { useLive } from '../../hooks/useLive'
import { cn } from '../../lib/cn'

const TripMap = lazy(() => import('../../components/rider/TripMap'))
const field = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base'
const BEFORE = ['shop_not_ready', 'cannot_reach_shop', 'other']
const AFTER = ['customer_unreachable', 'wrong_address', 'refused', 'other']

function Steps({ at, picked }: { at: boolean; picked: boolean }) {
  const items = [{ l: 'Accepted', d: true }, { l: 'At shop', d: at || picked }, { l: 'Picked up', d: picked }, { l: 'Delivered', d: false }]
  return (
    <ol className="flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-600" aria-label="Progress">
      {items.map((i) => (
        <li key={i.l} className="flex flex-1 flex-col items-center gap-1 text-center">
          {i.d ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5 text-slate-300" aria-hidden />}
          {i.l}
        </li>
      ))}
    </ol>
  )
}

function Row({ icon, label, children }: { icon?: boolean; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {children}
      {icon}
    </div>
  )
}

export default function RiderTrip({ embedded, onChanged }: { embedded?: boolean; onChanged?: () => void }) {
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
    await load()
    onChanged?.()
  }

  if (job === undefined) return error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-500">Loading…</p>
  if (!job) return msg ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-4 text-center text-base font-semibold text-emerald-800">{msg}</p> : null

  const shopPin: [number, number] | null = job.shop_lat != null && job.shop_lng != null ? [job.shop_lat, job.shop_lng] : null
  const custPin: [number, number] | null = job.cust_lat != null && job.cust_lng != null ? [job.cust_lat, job.cust_lng] : null
  const picked = job.job_status === 'picked_up'
  const atShop = Boolean(job.at_shop_at)
  const primary = 'flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-xl font-extrabold text-white disabled:opacity-50'
  const navBtn = 'flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-4 text-lg font-bold text-white'
  const callBtn = 'flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-4 text-lg font-bold text-slate-700'

  return (
    <div className="space-y-4">
      {!embedded && <h1 className="text-xl font-bold text-ink-900">Order #{job.order_no}</h1>}
      <Steps at={atShop} picked={picked} />

      {(shopPin || custPin) && (
        <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-slate-200" />}>
          <TripMap shop={picked ? null : shopPin} customer={picked ? custPin : custPin} />
        </Suspense>
      )}

      {!picked ? (
        <section className="space-y-3 rounded-2xl bg-white p-5 ring-2 ring-brand-500">
          <Row label={`Order #${job.order_no} · Go to the shop`}>
            <p className="text-xl font-extrabold text-slate-900">{job.shop_name}</p>
            <p className="text-base text-slate-600">{job.shop_address || 'No address'}</p>
          </Row>
          <div className="flex gap-2">
            {(job.shop_address || shopPin) && <a className={navBtn} href={mapsDir(job.shop_address, shopPin)} target="_blank" rel="noreferrer"><Navigation className="h-6 w-6" aria-hidden />Navigate</a>}
            {job.shop_phone && <a className={callBtn} href={'tel:' + job.shop_phone}><Phone className="h-6 w-6" aria-hidden />Call</a>}
          </div>
          <ul className="list-inside list-disc text-base text-slate-700">
            {job.items.map((i, k) => <li key={k}>{i.name}{i.size ? ` (${i.size})` : ''} × {i.qty}</li>)}
          </ul>
          {job.note && <p className="text-sm text-slate-500">Note: {job.note}</p>}
          {!atShop && (
            <button disabled={busy} className={cn(primary, 'bg-brand-600')} onClick={() => void act(async () => { await rpc('rider_arrived_shop', { p_job: job.job_id }); setMsg('The shop can see that you have arrived.') })}>
              {busy && <Loader2 className="h-6 w-6 animate-spin" aria-hidden />} I am at the shop
            </button>
          )}
          {atShop && job.order_status !== 'packed' && <p className="rounded-xl bg-amber-50 px-3 py-3 text-center text-base font-semibold text-amber-900">Waiting for the shop to pack the order…</p>}
          {atShop && (
            <button disabled={busy || job.order_status !== 'packed'} className={cn(primary, 'bg-ink-900')}
              onClick={() => void act(async () => { await rpc('rider_confirm_pickup', { p_job: job.job_id }) })}>
              {busy && <Loader2 className="h-6 w-6 animate-spin" aria-hidden />} I have the parcel
            </button>
          )}
          <p className="text-sm text-slate-500">Next: deliver to {job.customer_name}</p>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl bg-white p-5 ring-2 ring-brand-500">
          <Row label={`Order #${job.order_no} · Deliver`}>
            <p className="text-xl font-extrabold text-slate-900">{job.customer_name}</p>
            <p className="text-base text-slate-600">{job.address || 'No address'}</p>
            {job.note && <p className="mt-1 text-sm text-slate-500">Note: {job.note}</p>}
          </Row>
          {!custPin && <p className="text-xs text-slate-500">The customer did not share an exact pin. Use the address.</p>}
          <div className="flex gap-2">
            {(job.address || custPin) && <a className={navBtn} href={mapsDir(job.address, custPin)} target="_blank" rel="noreferrer"><Navigation className="h-6 w-6" aria-hidden />Navigate</a>}
            <a className={callBtn} href={'tel:' + job.customer_phone}><Phone className="h-6 w-6" aria-hidden />Call</a>
          </div>
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-lg font-bold text-amber-900">
            {job.collect_amount > 0 ? `Collect ${money(job.collect_amount)} cash` : 'Already paid. Do not collect cash.'}
          </p>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault()
            void act(async () => {
              const r = await rpc<{ result: string; attempts_left?: number; due?: number; earned?: number }>('rider_complete_delivery', { p_job: job.job_id, p_otp: otp, p_cash: job.collect_amount > 0 ? job.collect_amount : 0 })
              if (r.result === 'delivered') { setMsg(`Delivered! You earned ${money(r.earned ?? 0)}.`); setOtp(''); setCashOk(false) }
              else if (r.result === 'cash_mismatch') setError(`Cash due is ${money(r.due ?? 0)}. Collect the exact amount first.`)
              else if (r.result === 'locked') setError('Too many wrong codes. Call your manager to unlock.')
              else setError(`Wrong code. ${r.attempts_left ?? 0} tries left.`)
            })
          }}>
            <label className="block text-sm font-semibold text-slate-700">Customer's 4-digit code
              <input className={cn(field, 'mt-1 text-center text-3xl tracking-[0.5em]')} inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            {job.collect_amount > 0 && (
              <label className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-4 text-base font-bold text-amber-900">
                <input type="checkbox" className="h-6 w-6" checked={cashOk} onChange={(e) => setCashOk(e.target.checked)} />
                I collected {money(job.collect_amount)}
              </label>
            )}
            <button type="submit" disabled={busy || otp.length !== 4 || (job.collect_amount > 0 && !cashOk)} className={cn(primary, 'bg-brand-600')}>
              {busy && <Loader2 className="h-6 w-6 animate-spin" aria-hidden />} Complete delivery
            </button>
          </form>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base font-semibold text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-800">{msg}</p>}

      <section className="px-1">
        <button onClick={() => setIssue(!issue)} className="text-sm font-semibold text-red-700">{picked ? 'Delivery failed?' : 'Cannot pick up? Give the job back'}</button>
        {issue && (
          <div className="mt-3 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <select className={field} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
              <option value="">Choose a reason</option>
              {(picked ? AFTER : BEFORE).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
            <input className={field} placeholder="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            <button disabled={busy || !reason} className="w-full rounded-xl bg-red-600 py-4 text-lg font-bold text-white disabled:opacity-50"
              onClick={() => void act(async () => {
                if (picked) await rpc('rider_fail_delivery', { p_job: job.job_id, p_reason: reason, p_note: note || null })
                else await rpc('rider_report_issue', { p_job: job.job_id, p_kind: reason, p_note: note || null })
                setIssue(false); setReason(''); setNote('')
                setMsg(picked ? 'Reported. Your manager will follow up.' : 'The job went back to dispatch.')
              })}>Confirm</button>
          </div>
        )}
      </section>
    </div>
  )
}

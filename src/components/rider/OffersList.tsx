import { useCallback, useEffect, useState } from 'react'
import { rpc, type OfferRow } from '../../lib/api'
import { money } from '../../lib/format'
import { useLive } from '../../hooks/useLive'

const TABLES = ['delivery_offers']

function Countdown({ to, onDone }: { to: string; onDone: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(to).getTime() - Date.now()) / 1000)))
  useEffect(() => {
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(to).getTime() - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) onDone()
    }, 1000)
    return () => clearInterval(id)
  }, [to, onDone])
  return <span className="font-mono text-sm font-bold text-accent-600">{left}s</span>
}

export default function OffersList({ onAccepted }: { onAccepted?: () => void }) {
  const [offers, setOffers] = useState<OfferRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setOffers(await rpc<OfferRow[]>('rider_my_offers')); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load offers') }
  }, [])
  useEffect(() => { void load() }, [load])
  useLive(load, TABLES, 10000)

  async function respond(o: OfferRow, accept: boolean) {
    if (busy) return
    setBusy(o.offer_id)
    setMsg(null)
    try {
      const r = await rpc<{ result: string }>('rider_respond_offer', { p_offer: o.offer_id, p_accept: accept })
      if (r.result === 'accepted') { setMsg('Delivery accepted. Open the Trip tab.'); onAccepted?.() }
      else if (r.result === 'rejected') setMsg('Offer declined.')
      else if (r.result === 'expired') setMsg('That offer expired.')
      else if (r.result === 'busy') setMsg('Finish your current delivery first.')
      else setMsg('This delivery was taken by someone else.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    setBusy(null)
    void load()
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}
      {offers && offers.length === 0 && !error && <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">No offers right now. Stay online.</p>}
      {(offers ?? []).map((o) => (
        <article key={o.offer_id} className="rounded-2xl bg-white p-5 ring-2 ring-accent-400">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink-900">New delivery</h3>
            <Countdown to={o.expires_at} onDone={() => void load()} />
          </div>
          <p className="mt-2 text-sm text-slate-700"><b>Pickup:</b> {o.shop_name}<br />{o.shop_address || ''}</p>
          <p className="mt-1 text-sm text-slate-600">{o.items_count} item{o.items_count === 1 ? '' : 's'}{o.km != null ? ` · ${o.km.toFixed(1)} km from you` : ''}</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {o.collect_amount > 0 ? `Collect ${money(o.collect_amount)} (COD)` : 'Already paid. Do not collect cash.'}
          </p>
          <p className="text-sm text-slate-600">Delivery fee: {money(o.delivery_fee)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button disabled={busy !== null} onClick={() => void respond(o, false)} className="rounded-xl border border-slate-300 py-3.5 text-base font-semibold text-slate-700 disabled:opacity-50">Reject</button>
            <button disabled={busy !== null} onClick={() => void respond(o, true)} className="rounded-xl bg-brand-600 py-3.5 text-base font-bold text-white disabled:opacity-50">Accept</button>
          </div>
        </article>
      ))}
    </div>
  )
}

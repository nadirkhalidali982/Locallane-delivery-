import { useEffect, useState } from 'react'
import { rpc, type HistoryRow, type MyEarnings } from '../../lib/api'
import { ago, money } from '../../lib/format'
import { cn } from '../../lib/cn'

const KIND: Record<string, string> = {
  earning: 'Delivery earning', adjustment: 'Adjustment', payout: 'Paid to you', cod_collected: 'COD cash collected', cod_deposit: 'COD cash deposited',
}

export default function RiderHistory() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [earn, setEarn] = useState<MyEarnings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [dispute, setDispute] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    rpc<HistoryRow[]>('rider_my_history').then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
    rpc<MyEarnings>('rider_my_earnings').then(setEarn).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [])

  async function raise(jobId: string) {
    setError(null)
    setMsg(null)
    try { await rpc('rider_raise_dispute', { p_job: jobId, p_note: note }); setMsg('Sent to your manager.'); setDispute(null); setNote('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send') }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Earnings</h1>
      {earn && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">You will receive</p>
            <p className="text-2xl font-bold text-ink-900">{money(earn.earnings_balance)}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-xs text-amber-900">COD cash you hold</p>
            <p className="text-2xl font-bold text-amber-950">{money(earn.cod_held)}</p>
            <p className="mt-1 text-xs text-amber-900">Not your money. Deposit it.</p>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}

      <h2 className="pt-2 text-sm font-semibold text-slate-700">Deliveries</h2>
      {rows && rows.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">No finished deliveries yet.</p>}
      <ul className="space-y-3">
        {(rows ?? []).map((r) => (
          <li key={r.job_id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">Order #{r.order_no}</p>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', r.job_status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>
                {r.job_status === 'delivered' ? 'Delivered' : 'Failed'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{r.shop_name} · {ago(r.finished_at)}</p>
            <p className="text-sm text-slate-500">{r.address}</p>
            <button onClick={() => setDispute(dispute === r.job_id ? null : r.job_id)} className="mt-2 text-sm font-semibold text-brand-700">Something wrong?</button>
            {dispute === r.job_id && (
              <div className="mt-2 flex gap-2">
                <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="What is wrong?" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                <button disabled={note.trim().length < 3} onClick={() => void raise(r.job_id)} className="rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2 className="pt-2 text-sm font-semibold text-slate-700">Transactions</h2>
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {(earn?.rows ?? []).length === 0 && <li className="p-4 text-sm text-slate-600">Nothing yet.</li>}
        {(earn?.rows ?? []).map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{KIND[l.kind]}{l.order_no ? ` · #${l.order_no}` : ''}</p>
              <p className="truncate text-xs text-slate-500">{l.account === 'cod' ? 'COD cash' : 'Earnings'} · {ago(l.created_at)}{l.reference ? ' · ' + l.reference : ''}{l.note ? ' · ' + l.note : ''}</p>
            </div>
            <p className={cn('shrink-0 text-sm font-bold', l.amount > 0 ? 'text-emerald-700' : 'text-slate-700')}>{l.amount > 0 ? '+' : ''}{money(l.amount)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

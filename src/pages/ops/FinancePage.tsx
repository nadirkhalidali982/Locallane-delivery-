import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { rpc, type AdminLedgerRow, type DisputeRow, type FinanceRow } from '../../lib/api'
import { ago, money } from '../../lib/format'
import { useAuth } from '../../store/authStore'
import { cn } from '../../lib/cn'

type Tab = 'balances' | 'ledger' | 'disputes' | 'fees'
const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50'

function Balances({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<FinanceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState<{ rider: string; kind: 'earnings' | 'cod' | 'adj' } | null>(null)
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [account, setAccount] = useState<'earnings' | 'cod'>('earnings')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setRows(await rpc<FinanceRow[]>('delivery_finance_summary')); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form || busy) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const n = Number(amount)
      if (form.kind === 'adj') await rpc('delivery_add_adjustment', { p_rider: form.rider, p_account: account, p_amount: n, p_note: ref })
      else await rpc('delivery_record_settlement', { p_rider: form.rider, p_account: form.kind, p_amount: n, p_reference: ref })
      setMsg('Recorded.')
      setForm(null); setAmount(''); setRef('')
      await load()
      onChanged()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
    setBusy(false)
  }

  const totalCod = (rows ?? []).reduce((a, r) => a + r.cod_held, 0)
  const totalOwed = (rows ?? []).reduce((a, r) => a + r.earnings_balance, 0)

  return (
    <div className="space-y-4">
      {rows && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-500">Owed to riders</p><p className="text-2xl font-bold text-ink-900">{money(totalOwed)}</p></div>
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"><p className="text-xs text-amber-900">COD cash with riders</p><p className="text-2xl font-bold text-amber-950">{money(totalCod)}</p></div>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">No riders yet.</p>}
      {(rows ?? []).map((r) => (
        <article key={r.rider_id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-ink-900">{r.rider_name || 'Rider'} <span className="text-xs font-normal text-slate-500">{r.delivered_count} delivered</span></h3>
            <p className="text-sm">Owed <b>{money(r.earnings_balance)}</b> · COD cash <b className="text-amber-800">{money(r.cod_held)}</b></p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={cn(btn, 'bg-brand-600 text-white')} disabled={r.earnings_balance <= 0} onClick={() => setForm({ rider: r.rider_id, kind: 'earnings' })}>Record payout</button>
            <button className={cn(btn, 'bg-amber-600 text-white')} disabled={r.cod_held <= 0} onClick={() => setForm({ rider: r.rider_id, kind: 'cod' })}>Record COD deposit</button>
            <button className={cn(btn, 'border border-slate-300 text-slate-700')} onClick={() => setForm({ rider: r.rider_id, kind: 'adj' })}>Adjustment</button>
          </div>
          {form?.rider === r.rider_id && (
            <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
              {form.kind === 'adj' && (
                <select className={inp} value={account} onChange={(e) => setAccount(e.target.value as 'earnings' | 'cod')} aria-label="Account">
                  <option value="earnings">Earnings</option><option value="cod">COD cash</option>
                </select>
              )}
              <input className={cn(inp, 'w-32')} type="number" step="0.01" inputMode="decimal" placeholder={form.kind === 'adj' ? '+ or - amount' : 'Amount'} value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <input className={cn(inp, 'min-w-48 flex-1')} placeholder={form.kind === 'adj' ? 'Reason' : form.kind === 'cod' ? 'Receipt / UPI ref' : 'UPI id / ref'} value={ref} onChange={(e) => setRef(e.target.value)} required maxLength={form.kind === 'adj' ? 300 : 100} />
              <button type="submit" disabled={busy} className={cn(btn, 'bg-ink-900 text-white')}>Save</button>
              <button type="button" className={cn(btn, 'text-slate-600')} onClick={() => setForm(null)}>Cancel</button>
            </form>
          )}
        </article>
      ))}
    </div>
  )
}

function Ledger() {
  const [rows, setRows] = useState<AdminLedgerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<'' | 'earnings' | 'cod'>('')
  useEffect(() => {
    rpc<AdminLedgerRow[]>('delivery_ledger_list', { p_rider: null, p_account: account || null }).then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [account])
  return (
    <div className="space-y-3">
      <select className={inp} value={account} onChange={(e) => setAccount(e.target.value as '' | 'earnings' | 'cod')} aria-label="Account">
        <option value="">All accounts</option><option value="earnings">Earnings</option><option value="cod">COD cash</option>
      </select>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Rider</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Order</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Ref / note</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-3 py-2">{ago(l.created_at)}</td>
                <td className="px-3 py-2">{l.rider_name}</td>
                <td className="px-3 py-2">{l.account === 'cod' ? 'COD · ' : 'Earn · '}{l.kind.replace('_', ' ')}</td>
                <td className="px-3 py-2">{l.order_no ? '#' + l.order_no : ''}</td>
                <td className={cn('px-3 py-2 text-right font-semibold', l.amount > 0 ? 'text-emerald-700' : 'text-slate-700')}>{money(l.amount)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{[l.reference, l.note].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <p className="p-5 text-sm text-slate-600">No transactions yet.</p>}
      </div>
    </div>
  )
}

function Disputes({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<DisputeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [decision, setDecision] = useState('')
  const [adj, setAdj] = useState('')
  const load = useCallback(async () => {
    try { setRows(await rpc<DisputeRow[]>('delivery_disputes_list')); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])
  async function resolve(id: string) {
    setError(null)
    try { await rpc('delivery_resolve_dispute', { p_id: id, p_resolution: decision, p_adjustment: adj ? Number(adj) : null }); setOpen(null); setDecision(''); setAdj(''); await load(); onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">No disputes.</p>}
      {(rows ?? []).map((d) => (
        <article key={d.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between"><h3 className="font-bold text-ink-900">Order #{d.order_no} · {d.rider_name}</h3>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', d.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{d.status === 'open' ? 'Open' : 'Resolved'}</span></div>
          <p className="mt-1 text-sm text-slate-700">{d.note}</p>
          {d.resolution && <p className="mt-1 text-xs text-slate-500">Decision: {d.resolution}</p>}
          {d.status === 'open' && <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => setOpen(open === d.id ? null : d.id)}>Resolve</button>}
          {open === d.id && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input className={cn(inp, 'min-w-48 flex-1')} placeholder="Decision" value={decision} onChange={(e) => setDecision(e.target.value)} maxLength={300} />
              <input className={cn(inp, 'w-32')} type="number" step="0.01" placeholder="Adjust ₹ (optional)" value={adj} onChange={(e) => setAdj(e.target.value)} />
              <button disabled={decision.trim().length < 3} className={cn(btn, 'bg-ink-900 text-white')} onClick={() => void resolve(d.id)}>Save</button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function Fees() {
  const role = useAuth((s) => s.role)
  const [base, setBase] = useState('')
  const [perKm, setPerKm] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    rpc<{ rider_base_fee: number; rider_per_km: number }>('delivery_settings_get').then((s) => { setBase(String(s.rider_base_fee)); setPerKm(String(s.rider_per_km)) }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [])
  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    try { await rpc('delivery_settings_set', { p_base: Number(base), p_per_km: Number(perKm) }); setMsg('Saved. New deliveries use these fees.') } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
  }
  return (
    <form onSubmit={save} className="max-w-md space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">Rider earning per delivery = base + per km × distance (shop to customer pin). If the customer shared no pin, only the base applies.</p>
      <label className="block text-sm font-medium text-slate-700">Base fee (₹)<input className={cn(inp, 'mt-1 block w-full')} type="number" step="0.5" min="0" value={base} onChange={(e) => setBase(e.target.value)} disabled={role !== 'super_admin'} /></label>
      <label className="block text-sm font-medium text-slate-700">Per km (₹)<input className={cn(inp, 'mt-1 block w-full')} type="number" step="0.5" min="0" value={perKm} onChange={(e) => setPerKm(e.target.value)} disabled={role !== 'super_admin'} /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}
      {role === 'super_admin' ? <button type="submit" className={cn(btn, 'bg-brand-600 text-white')}>Save fees</button> : <p className="text-xs text-slate-500">Only the Super Admin can change fees.</p>}
    </form>
  )
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('balances')
  const [bump, setBump] = useState(0)
  const tabs: { k: Tab; l: string }[] = [{ k: 'balances', l: 'Balances' }, { k: 'ledger', l: 'Transactions' }, { k: 'disputes', l: 'Disputes' }, { k: 'fees', l: 'Fees' }]
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div><h1 className="text-2xl font-bold text-ink-900">Finance</h1><p className="text-sm text-slate-600">COD cash and rider earnings are kept in separate accounts.</p></div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
            className={cn('rounded-full px-4 py-2 text-sm font-semibold', tab === t.k ? 'bg-ink-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200')}>{t.l}</button>
        ))}
      </div>
      {tab === 'balances' && <Balances key={bump} onChanged={() => setBump(bump + 1)} />}
      {tab === 'ledger' && <Ledger key={bump} />}
      {tab === 'disputes' && <Disputes onChanged={() => setBump(bump + 1)} />}
      {tab === 'fees' && <Fees />}
    </div>
  )
}

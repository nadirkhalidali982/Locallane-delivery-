import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, type RiderAdminRow, type RiderZonePair, type ZoneRow } from '../../lib/api'
import { DOC_LABEL, ago } from '../../lib/format'
import { cn } from '../../lib/cn'

type Tab = 'pending' | 'approved' | 'other'

function Row({ r, zones, allowed, onChanged }: { r: RiderAdminRow; zones: ZoneRow[]; allowed: string[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reject, setReject] = useState(false)
  const [reason, setReason] = useState('')

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await fn(); onChanged() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    setBusy(false)
  }
  async function view(path: string) {
    const { data, error: err } = await supabase.storage.from('rider-docs').createSignedUrl(path, 120)
    if (err || !data) setError(err?.message ?? 'Could not open the file')
    else window.open(data.signedUrl, '_blank', 'noopener')
  }
  const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50'

  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-ink-900">{r.full_name || r.email}</h3>
          <p className="text-xs text-slate-500">{r.email} · {r.phone} · {r.city || 'no city'} · {r.vehicle_type || '-'} {r.vehicle_no || ''}</p>
        </div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', r.is_online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600')}>
          {r.is_member ? (r.is_online ? 'Online' : r.last_seen ? 'Offline · ' + ago(r.last_seen) : 'Offline') : 'Applicant'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {r.docs.length === 0 && <span className="text-sm text-slate-500">No documents yet</span>}
        {r.docs.map((d) => <button key={d.doc_type} onClick={() => void view(d.path)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-brand-700">{DOC_LABEL[d.doc_type]}</button>)}
      </div>
      {r.review_note && <p className="mt-2 text-xs text-slate-600">Review note: {r.review_note}</p>}
      {r.is_member && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600">Zones this rider may take orders from</p>
          {zones.length === 0 ? <p className="mt-1 text-xs text-amber-800">Create a zone first (Zones page).</p> : (
            <div className="mt-1 flex flex-wrap gap-2">
              {zones.map((z) => {
                const on = allowed.includes(z.zone_id)
                return (
                  <button key={z.zone_id} aria-pressed={on} disabled={busy}
                    onClick={() => void run(() => rpc('delivery_set_rider_zones', { p_rider: r.user_id, p_zones: on ? allowed.filter((x) => x !== z.zone_id) : [...allowed, z.zone_id] }))}
                    className={cn('rounded-full border px-3 py-1 text-xs font-semibold', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-700')}>
                    {z.zone_name}
                  </button>
                )
              })}
            </div>
          )}
          {allowed.length === 0 && zones.length > 0 && <p className="mt-1 text-xs text-amber-800">No zone selected: this rider gets no offers.</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.app_status && r.app_status !== 'approved' && (
          <button disabled={busy} className={cn(btn, 'bg-brand-600 text-white')} onClick={() => void run(() => rpc('delivery_review_rider', { p_user: r.user_id, p_approve: true }))}>Approve</button>
        )}
        {r.app_status === 'pending' && <button disabled={busy} className={cn(btn, 'border border-slate-300 text-slate-700')} onClick={() => setReject(!reject)}>Reject</button>}
        {r.is_member && (
          <button disabled={busy} className={cn(btn, 'border border-slate-300 text-slate-700')} onClick={() => void run(() => rpc('delivery_set_member_active', { p_user: r.user_id, p_active: !r.is_active }))}>
            {r.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>
      {reject && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Reason (the rider will see this)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <button disabled={busy || reason.trim().length < 3} className={cn(btn, 'bg-red-600 text-white')} onClick={() => void run(async () => { await rpc('delivery_review_rider', { p_user: r.user_id, p_approve: false, p_note: reason }); setReject(false); setReason('') })}>Confirm</button>
        </div>
      )}
    </article>
  )
}

export default function RidersPage() {
  const [rows, setRows] = useState<RiderAdminRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [zones, setZones] = useState<ZoneRow[]>([])
  const [pairs, setPairs] = useState<RiderZonePair[]>([])

  const load = useCallback(async () => {
    try {
      const [list, zs, ps] = await Promise.all([rpc<RiderAdminRow[]>('delivery_riders_list'), rpc<ZoneRow[]>('delivery_zones_overview'), rpc<RiderZonePair[]>('delivery_rider_zone_pairs')])
      setRows(list); setZones(zs); setPairs(ps); setError(null)
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])

  const pick = (t: Tab) => (rows ?? []).filter((r) => (t === 'pending' ? r.app_status === 'pending' : t === 'approved' ? r.is_member : !r.is_member && r.app_status !== 'pending'))
  const tabs: { key: Tab; label: string }[] = [{ key: 'pending', label: 'To review' }, { key: 'approved', label: 'Riders' }, { key: 'other', label: 'Rejected' }]

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Riders</h1>
        <p className="text-sm text-slate-600">Check documents, then approve. Approved riders can go online and receive offers.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('rounded-full px-4 py-2 text-sm font-semibold', tab === t.key ? 'bg-ink-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200')}>
            {t.label} <span className="opacity-70">{rows ? pick(t.key).length : ''}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {rows && pick(tab).length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">Nothing here.</p>}
      <div className="space-y-3">{pick(tab).map((r) => <Row key={r.user_id} r={r} zones={zones} allowed={pairs.filter((p) => p.rider_id === r.user_id).map((p) => p.zone_id)} onChanged={() => void load()} />)}</div>
    </div>
  )
}

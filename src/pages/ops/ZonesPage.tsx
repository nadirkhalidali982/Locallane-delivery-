import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent } from 'react'
import { rpc, type ZoneRow } from '../../lib/api'
import { getPosition } from '../../lib/format'
import { useAuth } from '../../store/authStore'
import { cn } from '../../lib/cn'

const ZoneMap = lazy(() => import('../../components/ZoneMap'))
const inp = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50'
const STATUS = { active: 'Active', paused: 'Paused', inactive: 'Off' } as const
const TONE = { active: 'bg-emerald-100 text-emerald-800', paused: 'bg-amber-100 text-amber-800', inactive: 'bg-slate-200 text-slate-600' } as const

function ZoneEditor({ z, canEdit, onDone }: { z: ZoneRow; canEdit: boolean; onDone: () => void }) {
  const [f, setF] = useState({
    name: z.zone_name, lat: z.center_lat, lng: z.center_lng, radius: String(z.radius_km), status: z.status,
    base: z.base_fee == null ? '' : String(z.base_fee), perKm: z.per_km == null ? '' : String(z.per_km),
    offer: String(z.offer_seconds), fresh: String(Math.round(z.gps_fresh_seconds / 60)), pickup: String(z.max_pickup_km),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await rpc('delivery_update_zone', {
        p_zone: z.zone_id, p_name: f.name, p_lat: f.lat, p_lng: f.lng, p_radius_km: Number(f.radius), p_status: f.status,
        p_base_fee: f.base === '' ? null : Number(f.base), p_per_km: f.perKm === '' ? null : Number(f.perKm),
        p_offer_seconds: Number(f.offer), p_fresh_seconds: Math.round(Number(f.fresh) * 60), p_max_pickup_km: Number(f.pickup),
      })
      onDone()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
    setBusy(false)
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200" />}>
        <ZoneMap lat={f.lat} lng={f.lng} radiusKm={Number(f.radius) || 1} readOnly={!canEdit} onPick={(la, ln) => setF((p) => ({ ...p, lat: la, lng: ln }))} />
      </Suspense>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Zone name<input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></label>
        <label className="text-sm font-medium text-slate-700">Status
          <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ZoneRow['status'] })}>
            <option value="active">Active: taking orders</option><option value="paused">Paused: no automatic offers</option><option value="inactive">Off</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Radius (km)<input className={inp} type="number" step="0.5" min="0.5" max="100" value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} /></label>
        <label className="text-sm font-medium text-slate-700">Rider must be within (km of the shop)<input className={inp} type="number" step="1" min="1" max="100" value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })} /></label>
        <label className="text-sm font-medium text-slate-700">Rider base fee (₹), empty = default<input className={inp} type="number" step="0.5" min="0" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} /></label>
        <label className="text-sm font-medium text-slate-700">Rider fee per km (₹), empty = default<input className={inp} type="number" step="0.5" min="0" value={f.perKm} onChange={(e) => setF({ ...f, perKm: e.target.value })} /></label>
        <label className="text-sm font-medium text-slate-700">Offer time (seconds)<input className={inp} type="number" step="5" min="20" max="300" value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} /></label>
        <label className="text-sm font-medium text-slate-700">Rider location must be newer than (minutes)<input className={inp} type="number" step="1" min="1" max="60" value={f.fresh} onChange={(e) => setF({ ...f, fresh: e.target.value })} /></label>
      </fieldset>
      {canEdit && <p className="text-xs text-slate-500">Tap the map to move the centre.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {canEdit && <button type="submit" disabled={busy} className={cn(btn, 'bg-brand-600 text-white')}>Save zone</button>}
    </form>
  )
}

export default function ZonesPage() {
  const role = useAuth((s) => s.role)
  const canEdit = role === 'super_admin'
  const [zones, setZones] = useState<ZoneRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [n, setN] = useState({ city: '', state: '', zone: 'Main zone', lat: null as number | null, lng: null as number | null, radius: '5' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setZones(await rpc<ZoneRow[]>('delivery_zones_overview')); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function useMyLocation() {
    const p = await getPosition()
    if (p) setN((x) => ({ ...x, lat: p.lat, lng: p.lng }))
    else setError('Could not get your location. Tap the map instead.')
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await rpc('delivery_create_zone', { p_city: n.city, p_state: n.state, p_zone: n.zone, p_lat: n.lat, p_lng: n.lng, p_radius_km: Number(n.radius) })
      setAdding(false)
      setN({ city: '', state: '', zone: 'Main zone', lat: null, lng: null, radius: '5' })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create') }
    setBusy(false)
  }

  async function toggleCity(z: ZoneRow) {
    setError(null)
    try { await rpc('delivery_set_city_active', { p_city: z.city_id, p_active: !z.city_active }); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Could not change') }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Cities and zones</h1>
          <p className="text-sm text-slate-600">Delivery works only inside an active zone. Add a village, town or city here. No code change is needed.</p>
        </div>
        {canEdit && <button className={cn(btn, 'bg-brand-600 text-white')} onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add city or zone'}</button>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {adding && (
        <form onSubmit={create} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">City, town or village<input className={inp} value={n.city} onChange={(e) => setN({ ...n, city: e.target.value })} required minLength={2} placeholder="Type the name" /></label>
            <label className="text-sm font-medium text-slate-700">State (optional)<input className={inp} value={n.state} onChange={(e) => setN({ ...n, state: e.target.value })} /></label>
            <label className="text-sm font-medium text-slate-700">Zone name<input className={inp} value={n.zone} onChange={(e) => setN({ ...n, zone: e.target.value })} required minLength={2} /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Radius (km)
            <input className={inp} type="number" step="0.5" min="0.5" max="100" value={n.radius} onChange={(e) => setN({ ...n, radius: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={cn(btn, 'border border-slate-300 text-slate-700')} onClick={() => void useMyLocation()}>Use my current location as the centre</button>
            <span className="text-xs text-slate-500">or tap the map</span>
          </div>
          <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200" />}>
            <ZoneMap lat={n.lat} lng={n.lng} radiusKm={Number(n.radius) || 1} onPick={(la, ln) => setN((x) => ({ ...x, lat: la, lng: ln }))} />
          </Suspense>
          <button type="submit" disabled={busy || n.lat == null} className={cn(btn, 'bg-ink-900 text-white')}>Create zone</button>
        </form>
      )}

      {zones && zones.length === 0 && !adding && (
        <p className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">No zone yet. {canEdit ? 'Press Add city or zone to set your launch area. Until then shops cannot use LocalLane Delivery.' : 'Ask the Super Admin to create the first zone.'}</p>
      )}

      {(zones ?? []).map((z) => (
        <article key={z.zone_id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-ink-900">{z.zone_name} <span className="font-normal text-slate-500">· {z.city_name}{z.state ? ', ' + z.state : ''}</span></h3>
              <p className="text-xs text-slate-500">Radius {z.radius_km} km · offer {z.offer_seconds}s</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', z.city_active ? TONE[z.status] : 'bg-slate-200 text-slate-600')}>{z.city_active ? STATUS[z.status] : 'City paused'}</span>
          </div>
          <p className="mt-2 text-sm text-slate-700">{z.shops} shop{z.shops === 1 ? '' : 's'} · {z.riders_authorized} rider{z.riders_authorized === 1 ? '' : 's'} allowed · <b>{z.riders_online}</b> online now</p>
          {z.shops === 0 && <p className="mt-1 text-xs text-amber-800">No shop is inside this zone yet. Shops must set their location in Settings.</p>}
          {z.riders_authorized === 0 && <p className="mt-1 text-xs text-amber-800">No rider is allowed in this zone. Open Riders and tick this zone.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={cn(btn, 'border border-slate-300 text-slate-700')} onClick={() => setOpen(open === z.zone_id ? null : z.zone_id)}>{open === z.zone_id ? 'Close' : canEdit ? 'Edit' : 'View'}</button>
            {canEdit && <button className={cn(btn, 'border border-slate-300 text-slate-700')} onClick={() => void toggleCity(z)}>{z.city_active ? 'Pause city' : 'Resume city'}</button>}
          </div>
          {open === z.zone_id && <ZoneEditor z={z} canEdit={canEdit} onDone={() => { setOpen(null); void load() }} />}
        </article>
      ))}
    </div>
  )
}

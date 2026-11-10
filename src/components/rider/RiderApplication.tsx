import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { rpc, type Application } from '../../lib/api'
import { useAuth } from '../../store/authStore'
import DocUploader from './DocUploader'

const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900'

export default function RiderApplication() {
  const { session, refreshRole } = useAuth()
  const uid = session?.user.id ?? ''
  const [app, setApp] = useState<Application | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', phone: '', city: '', vehicle: 'bike', vno: '' })

  const load = useCallback(async () => {
    try {
      const a = await rpc<Application>('rider_my_application')
      setApp(a)
      if (a.profile) setF({ name: a.profile.full_name, phone: a.profile.phone, city: a.profile.city ?? '', vehicle: a.profile.vehicle_type, vno: a.profile.vehicle_no ?? '' })
      if (a.profile?.status === 'approved') void refreshRole()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [refreshRole])
  useEffect(() => { void load() }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await rpc('rider_apply', { p_name: f.name, p_phone: f.phone, p_city: f.city, p_vehicle_type: f.vehicle, p_vehicle_no: f.vno })
      setEditing(false)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit') }
    setBusy(false)
  }

  if (!app) return <p className="text-sm text-slate-500">{error ?? 'Loading…'}</p>
  const p = app.profile

  if (!p || editing) {
    return (
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">Apply as a delivery rider</h2>
        {p?.status === 'rejected' && p.review_note && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Last review: {p.review_note}</p>}
        <label className="block text-sm font-medium text-slate-700">Full name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={80} /></label>
        <label className="block text-sm font-medium text-slate-700">Phone<input className={field} type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required pattern="[0-9+ ]{10,15}" /></label>
        <label className="block text-sm font-medium text-slate-700">City<input className={field} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={60} /></label>
        <label className="block text-sm font-medium text-slate-700">Vehicle
          <select className={field} value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}>
            <option value="bike">Motorbike</option><option value="scooter">Scooter</option><option value="cycle">Cycle</option><option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">Vehicle number<input className={field} value={f.vno} onChange={(e) => setF({ ...f, vno: e.target.value })} maxLength={20} /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Submit application
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink-900">
          {p.status === 'pending' && 'Application under review'}
          {p.status === 'approved' && 'Approved'}
          {p.status === 'rejected' && 'Application not approved'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {p.status === 'pending' && 'Upload your documents. A manager will review them, then you can start taking deliveries.'}
          {p.status === 'approved' && 'You are approved. Tap Check again.'}
          {p.status === 'rejected' && (p.review_note || 'Please update your details and documents, then apply again.')}
        </p>
      </div>
      <DocUploader userId={uid} docs={app.docs} onChanged={() => void load()} />
      <div className="flex gap-3">
        <button onClick={() => void refreshRole().then(load)} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">Check again</button>
        {p.status !== 'approved' && <button onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Edit details</button>}
      </div>
    </div>
  )
}

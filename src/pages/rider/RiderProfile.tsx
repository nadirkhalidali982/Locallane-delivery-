import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../store/authStore'
import { rpc, type Application } from '../../lib/api'
import DocUploader from '../../components/rider/DocUploader'

const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base'

export default function RiderProfile() {
  const { session, signOut } = useAuth()
  const [app, setApp] = useState<Application | null>(null)
  const [f, setF] = useState({ phone: '', city: '', vehicle: 'bike', vno: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const a = await rpc<Application>('rider_my_application')
      setApp(a)
      if (a.profile) setF({ phone: a.profile.phone, city: a.profile.city ?? '', vehicle: a.profile.vehicle_type, vno: a.profile.vehicle_no ?? '' })
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    try { await rpc('rider_update_profile', { p_phone: f.phone, p_city: f.city, p_vehicle_type: f.vehicle, p_vehicle_no: f.vno }); setMsg('Saved.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Profile</h1>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-800">{app?.profile?.full_name ?? 'Rider'}</p>
        <p className="text-sm text-slate-600">{session?.user.email}</p>
      </div>
      {app?.profile && (
        <form onSubmit={save} className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <label className="block text-sm font-medium text-slate-700">Phone<input className={field} type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required pattern="[0-9+ ]{10,15}" /></label>
          <label className="block text-sm font-medium text-slate-700">City<input className={field} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={60} /></label>
          <label className="block text-sm font-medium text-slate-700">Vehicle
            <select className={field} value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })}>
              <option value="bike">Motorbike</option><option value="scooter">Scooter</option><option value="cycle">Cycle</option><option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Vehicle number<input className={field} value={f.vno} onChange={(e) => setF({ ...f, vno: e.target.value })} maxLength={20} /></label>
          <button type="submit" className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white">Save</button>
        </form>
      )}
      {app && session && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Documents</h2>
          <DocUploader userId={session.user.id} docs={app.docs} onChanged={() => void load()} />
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{msg}</p>}
      <button onClick={() => void signOut()} className="w-full rounded-xl border border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-700">Sign out</button>
    </div>
  )
}

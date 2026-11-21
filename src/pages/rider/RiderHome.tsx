import { useCallback, useEffect, useState } from 'react'
import { rpc, type RiderJob, type RiderToday } from '../../lib/api'
import { money } from '../../lib/format'
import { useLive } from '../../hooks/useLive'
import OnlineToggle from '../../components/rider/OnlineToggle'
import OffersList from '../../components/rider/OffersList'
import RiderTrip from './RiderTrip'

/** The only screen a rider needs: status, today's numbers, then either a new order or the delivery in progress. */
export default function RiderHome() {
  const [online, setOnline] = useState(false)
  const [job, setJob] = useState<boolean | null>(null)
  const [today, setToday] = useState<RiderToday | null>(null)
  const onChange = useCallback((v: boolean) => setOnline(v), [])
  const load = useCallback(async () => {
    try { setJob((await rpc<RiderJob[]>('rider_my_jobs')).length > 0) } catch { setJob(false) }
    try { setToday(await rpc<RiderToday>('rider_today')) } catch { /* shown as dashes */ }
  }, [])
  useEffect(() => { void load() }, [load])
  useLive(load, ['delivery_jobs'], 30000)

  return (
    <div className="space-y-4">
      <OnlineToggle onChange={onChange} compact={job === true} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Today</p>
          <p className="text-2xl font-extrabold text-ink-900">{today ? today.deliveries : '-'} <span className="text-sm font-semibold text-slate-500">delivered</span></p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Earned today</p>
          <p className="text-2xl font-extrabold text-emerald-700">{today ? money(today.earned) : '-'}</p>
        </div>
      </div>
      {today && today.cod_held > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">You hold {money(today.cod_held)} COD cash. Deposit it with the office.</p>
      )}
      {job === true && <RiderTrip embedded onChanged={() => void load()} />}
      {job === false && online && <OffersList onAccepted={() => void load()} />}
      {job === false && !online && <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-600 ring-1 ring-slate-200">Go online to get orders.</p>}
    </div>
  )
}

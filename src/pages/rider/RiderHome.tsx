import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/authStore'
import OnlineToggle from '../../components/rider/OnlineToggle'
import OffersList from '../../components/rider/OffersList'
import { rpc, type RiderJob } from '../../lib/api'

export default function RiderHome() {
  const { name, session } = useAuth()
  const [online, setOnline] = useState(false)
  const [job, setJob] = useState<RiderJob | null>(null)
  const onChange = useCallback((v: boolean) => setOnline(v), [])
  const loadJob = useCallback(async () => {
    try { setJob((await rpc<RiderJob[]>('rider_my_jobs'))[0] ?? null) } catch { /* shown on Trip tab */ }
  }, [])
  useEffect(() => { void loadJob() }, [loadJob])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">Hi, {name || session?.user.email}</h1>
      <OnlineToggle onChange={onChange} />
      {job && (
        <Link to="/rider/trip" className="block rounded-2xl bg-ink-900 p-5 text-white">
          <p className="text-sm text-accent-400">Current delivery</p>
          <p className="mt-1 text-lg font-bold">Order #{job.order_no} · {job.shop_name}</p>
          <p className="mt-1 text-sm text-slate-300">Tap to open pickup and address</p>
        </Link>
      )}
      {online && !job && <OffersList onAccepted={() => void loadJob()} />}
    </div>
  )
}

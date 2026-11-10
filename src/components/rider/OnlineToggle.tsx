import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../lib/api'
import { getPosition } from '../../lib/format'
import { useAuth } from '../../store/authStore'
import { cn } from '../../lib/cn'

/** Big thumb-sized online/offline switch. While online it refreshes the rider's location every minute. */
export default function OnlineToggle({ onChange }: { onChange?: (online: boolean) => void }) {
  const uid = useAuth((s) => s.session?.user.id)
  const [online, setOnline] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    void supabase.from('delivery_rider_status').select('is_online').eq('user_id', uid).maybeSingle().then(({ data }) => {
      const v = Boolean(data?.is_online)
      setOnline(v)
      onChange?.(v)
    })
  }, [uid, onChange])

  const beat = useCallback(async () => {
    const pos = await getPosition()
    try { await rpc('rider_set_status', { p_online: true, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null }) } catch { /* retried next minute */ }
  }, [])

  useEffect(() => {
    if (!online) return
    const id = setInterval(() => void beat(), 60000)
    return () => clearInterval(id)
  }, [online, beat])

  async function toggle() {
    if (busy || online === null) return
    setBusy(true)
    setError(null)
    try {
      const next = !online
      const pos = next ? await getPosition() : null
      await rpc('rider_set_status', { p_online: next, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null })
      setOnline(next)
      onChange?.(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change status')
    }
    setBusy(false)
  }

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <p className="text-sm font-semibold text-slate-800">{online ? 'You are online' : 'You are offline'}</p>
      <p className="mt-1 text-sm text-slate-600">{online ? 'Delivery offers near you will appear here.' : 'Go online to receive delivery offers.'}</p>
      <button onClick={() => void toggle()} disabled={busy || online === null}
        className={cn('mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold disabled:opacity-60', online ? 'bg-slate-800 text-white' : 'bg-brand-600 text-white')}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        {online ? 'Go offline' : 'Go online'}
      </button>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../lib/api'
import { getPosition } from '../../lib/format'
import { useAuth } from '../../store/authStore'
import { cn } from '../../lib/cn'

/** One big Online / Offline button. While online it sends the location every minute and keeps the screen awake. */
export default function OnlineToggle({ onChange, compact }: { onChange?: (online: boolean) => void; compact?: boolean }) {
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

  useEffect(() => {
    if (!online || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const get = async () => { try { lock = await navigator.wakeLock.request('screen') } catch { /* not allowed */ } }
    void get()
    const onVis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release() }
  }, [online])

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

  const label = online ? 'ONLINE' : 'OFFLINE'
  return (
    <div>
      <button onClick={() => void toggle()} disabled={busy || online === null} aria-pressed={Boolean(online)}
        className={cn('flex w-full items-center justify-between gap-3 rounded-2xl px-5 font-bold text-white disabled:opacity-60', compact ? 'py-3 text-base' : 'py-6 text-xl', online ? 'bg-emerald-600' : 'bg-slate-700')}>
        <span className="flex items-center gap-3">
          <span className={cn('h-3 w-3 rounded-full', online ? 'bg-white' : 'bg-slate-400')} aria-hidden />
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : label}
        </span>
        <span className="text-sm font-semibold opacity-90">{online ? 'Tap to go offline' : 'Tap to go online'}</span>
      </button>
      {online && !compact && <p className="mt-2 text-center text-xs text-slate-500">Keep this screen open to get orders.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

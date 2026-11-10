import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/** Calls reload() on realtime changes of the given tables, when the tab becomes visible, and every few seconds as a fallback. */
export function useLive(reload: () => void, tables: string[], everyMs = 15000) {
  const fn = useRef(reload)
  fn.current = reload
  const key = tables.join(',')
  useEffect(() => {
    const call = () => fn.current()
    const ch = supabase.channel('live-' + key + '-' + Math.random().toString(36).slice(2))
    key.split(',').forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, call))
    ch.subscribe()
    const id = setInterval(call, everyMs)
    const onVis = () => { if (document.visibilityState === 'visible') call() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      supabase.removeChannel(ch)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [key, everyMs])
}

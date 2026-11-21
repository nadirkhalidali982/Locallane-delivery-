import { useEffect, useRef } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** Click the map to move the zone centre. The circle shows the delivery area. OpenStreetMap tiles, no extra service. */
export default function ZoneMap({ lat, lng, radiusKm, onPick, readOnly }: { lat: number | null; lng: number | null; radiusKm: number; onPick?: (lat: number, lng: number) => void; readOnly?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const dot = useRef<L.CircleMarker | null>(null)
  const ring = useRef<L.Circle | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current).setView(lat != null && lng != null ? [lat, lng] : [22.5, 79], lat != null ? 12 : 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m)
    if (!readOnly) m.on('click', (e: L.LeafletMouseEvent) => pick.current?.(e.latlng.lat, e.latlng.lng))
    map.current = m
    return () => { m.remove(); map.current = null; dot.current = null; ring.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    dot.current?.remove()
    ring.current?.remove()
    if (lat == null || lng == null) return
    dot.current = L.circleMarker([lat, lng], { radius: 7, color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 1 }).addTo(m)
    ring.current = L.circle([lat, lng], { radius: Math.max(0.5, radiusKm) * 1000, color: '#0f766e', weight: 2, fillOpacity: 0.08 }).addTo(m)
    m.fitBounds(ring.current.getBounds(), { padding: [20, 20] })
  }, [lat, lng, radiusKm])

  return <div ref={el} className="h-64 w-full overflow-hidden rounded-2xl ring-1 ring-slate-200" role="img" aria-label="Map showing the delivery zone" />
}

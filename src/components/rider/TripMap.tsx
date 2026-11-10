import { useEffect, useRef } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Pin = [number, number] | null

/** OpenStreetMap (free). Circle markers are used so no marker image files are needed. */
export default function TripMap({ shop, customer }: { shop: Pin; customer: Pin }) {
  const ref = useRef<HTMLDivElement>(null)
  const sLat = shop?.[0], sLng = shop?.[1], cLat = customer?.[0], cLng = customer?.[1]

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pts: [number, number][] = []
    if (sLat != null && sLng != null) pts.push([sLat, sLng])
    if (cLat != null && cLng != null) pts.push([cLat, cLng])
    if (pts.length === 0) return
    const map = L.map(el)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map)
    if (sLat != null && sLng != null) L.circleMarker([sLat, sLng], { radius: 10, color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 1 }).addTo(map).bindTooltip('Pickup')
    if (cLat != null && cLng != null) L.circleMarker([cLat, cLng], { radius: 10, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 1 }).addTo(map).bindTooltip('Delivery')
    if (pts.length === 1) map.setView(pts[0], 15)
    else map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] })
    return () => { map.remove() }
  }, [sLat, sLng, cLat, cLng])

  return <div ref={ref} className="h-56 w-full overflow-hidden rounded-2xl ring-1 ring-slate-200" role="img" aria-label="Map showing pickup and delivery points" />
}

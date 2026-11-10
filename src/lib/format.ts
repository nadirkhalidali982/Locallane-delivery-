import type { JobStatus } from './api'

export const money = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)

export function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return new Date(iso).toLocaleDateString('en-IN')
}

export const JOB_LABEL: Record<JobStatus, string> = {
  pending_verification: 'Needs check',
  ready_for_dispatch: 'Ready to dispatch',
  offering: 'Offer sent',
  assigned: 'Rider assigned',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const JOB_TONE: Record<JobStatus, string> = {
  pending_verification: 'bg-amber-100 text-amber-800',
  ready_for_dispatch: 'bg-sky-100 text-sky-800',
  offering: 'bg-violet-100 text-violet-800',
  assigned: 'bg-brand-100 text-brand-800',
  picked_up: 'bg-brand-100 text-brand-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
}

export const EVENT_LABEL: Record<string, string> = {
  job_created: 'Order marked ready for pickup',
  verified: 'Verified by staff',
  verification_failed: 'Rejected at verification',
  offered: 'Offer sent to rider',
  offer_rejected: 'Rider rejected the offer',
  offer_expired: 'Offer expired',
  offer_cancelled_offline: 'Rider went offline',
  no_rider_available: 'No rider available',
  accepted: 'Rider accepted',
  assigned_manually: 'Assigned by manager',
  unassigned: 'Unassigned by manager',
  order_cancelled: 'Order cancelled',
  picked_up: 'Rider picked up the parcel',
  delivered: 'Delivered (code verified)',
  delivery_failed: 'Delivery failed',
  rider_released: 'Rider gave the job back',
  requeued: 'Sent for dispatch again',
  otp_locked: 'Delivery code locked',
  otp_reset: 'Delivery code unlocked',
}

export const DOC_LABEL: Record<string, string> = { id_proof: 'ID proof', photo: 'Photo', licence: 'Driving licence', vehicle_doc: 'Vehicle papers' }
export const REASON_LABEL: Record<string, string> = {
  shop_not_ready: 'Parcel is not ready at the shop', cannot_reach_shop: 'Cannot reach the shop', other: 'Other reason',
  customer_unreachable: 'Customer not reachable', wrong_address: 'Wrong or unclear address', refused: 'Customer refused',
}

export function mapsDir(address: string | null, pin?: [number, number] | null): string {
  const dest = pin ? pin[0] + ',' + pin[1] : encodeURIComponent(address ?? '')
  return 'https://www.google.com/maps/dir/?api=1&destination=' + dest
}

export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

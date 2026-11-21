import { supabase } from './supabase'

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export type JobStatus =
  | 'pending_verification' | 'ready_for_dispatch' | 'offering' | 'assigned' | 'picked_up' | 'delivered' | 'failed' | 'cancelled'

export interface JobItem { name: string; size: string | null; qty: number; price?: number }

export interface JobRow {
  job_id: string
  order_id: string
  order_no: number
  job_status: JobStatus
  shop_name: string
  shop_address: string | null
  shop_phone: string | null
  customer_name: string
  customer_phone: string
  address: string | null
  note: string | null
  total: number
  delivery_fee: number
  payment_method: string
  payment_status: string
  items: JobItem[]
  rider_id: string | null
  rider_name: string | null
  failure_reason: string | null
  created_at: string
  updated_at: string
  picked_up_at: string | null
  delivered_at: string | null
  otp_locked: boolean
  offer_after: string | null
  no_rider_since: string | null
  at_shop_at: string | null
  prep_minutes: number | null
  auto_verified: boolean
  zone_name: string | null
  geo_flag: 'no_zone' | 'customer_outside_zone' | 'no_customer_pin' | null
}

export interface NearbyRider { user_id: string; full_name: string | null; phone: string | null; km: number | null; tried: boolean }
export interface JobEvent { id: number; action: string; from_status: string | null; to_status: string | null; note: string | null; actor_name: string | null; created_at: string }

export interface OfferRow {
  offer_id: string; job_id: string; order_no: number; shop_name: string; shop_address: string | null; items_count: number
  payment_method: string; collect_amount: number; est_earning: number; pickup_km: number | null; trip_km: number | null; expires_at: string
}

export interface RiderJob {
  job_id: string; order_no: number; job_status: JobStatus; shop_name: string; shop_address: string | null; shop_phone: string | null
  customer_name: string; customer_phone: string; address: string | null; note: string | null; total: number
  payment_method: string; payment_status: string; collect_amount: number; items: JobItem[]
  shop_lat: number | null; shop_lng: number | null; cust_lat: number | null; cust_lng: number | null; picked_up_at: string | null
  at_shop_at: string | null; order_status: string
}

export interface HistoryRow { job_id: string; order_no: number; job_status: JobStatus; shop_name: string; address: string | null; total: number; collect_amount: number; delivery_fee: number; finished_at: string }

export interface RiderProfile { full_name: string; phone: string; city: string | null; vehicle_type: 'bike' | 'scooter' | 'cycle' | 'other'; vehicle_no: string | null; status: 'pending' | 'approved' | 'rejected'; review_note: string | null }
export type DocType = 'id_proof' | 'licence' | 'vehicle_doc' | 'photo'
export interface RiderDoc { doc_type: DocType; path: string }
export interface Application { profile: RiderProfile | null; docs: RiderDoc[] }

export interface RiderAdminRow {
  user_id: string; full_name: string | null; phone: string | null; email: string | null; city: string | null; vehicle_type: string | null; vehicle_no: string | null
  app_status: 'pending' | 'approved' | 'rejected' | null; review_note: string | null; is_member: boolean; is_active: boolean; is_online: boolean
  last_seen: string | null; docs: RiderDoc[]; created_at: string
}

export interface LedgerRow { id: number; account: 'earnings' | 'cod'; kind: 'earning' | 'adjustment' | 'payout' | 'cod_collected' | 'cod_deposit'; amount: number; reference: string | null; note: string | null; order_no: number | null; created_at: string }
export interface MyEarnings { earnings_balance: number; cod_held: number; rows: LedgerRow[] }
export interface FinanceRow { rider_id: string; rider_name: string | null; is_active: boolean; earnings_balance: number; cod_held: number; delivered_count: number }
export interface AdminLedgerRow extends LedgerRow { rider_id: string; rider_name: string | null }
export interface DisputeRow { id: string; job_id: string; order_no: number; rider_id: string; rider_name: string | null; note: string; status: 'open' | 'resolved'; resolution: string | null; created_at: string }

export interface ZoneRow {
  zone_id: string; city_id: string; city_name: string; state: string | null; city_active: boolean; zone_name: string
  center_lat: number; center_lng: number; radius_km: number; status: 'active' | 'paused' | 'inactive'
  base_fee: number | null; per_km: number | null; offer_seconds: number; gps_fresh_seconds: number; max_pickup_km: number
  shops: number; riders_authorized: number; riders_online: number
}
export interface LiveRider { user_id: string; full_name: string | null; phone: string | null; state: 'available' | 'busy' | 'offered' | 'gps_old' | 'offline'; last_seen: string | null; zones: string | null }
export interface RiderToday { deliveries: number; earned: number; cod_held: number }
export interface DashboardIssue { job_id: string; order_no: number; kind: 'needs_check' | 'no_rider' | 'failed' | 'otp_locked' | 'late_pickup' | 'late_delivery'; since: string; shop: string }
export interface DashboardZone { zone_id: string; zone: string; city: string; status: string; jobs_today: number; active: number; waiting: number; delivered: number; failed: number; riders_online: number }
export interface Dashboard {
  today: { orders: number; delivered: number; failed: number; cancelled: number; active: number; waiting: number; attention: number }
  riders: Partial<Record<'available' | 'busy' | 'offered' | 'gps_old' | 'offline', number>>
  zones: DashboardZone[]
  issues: DashboardIssue[]
}
export interface RiderZonePair { rider_id: string; zone_id: string }

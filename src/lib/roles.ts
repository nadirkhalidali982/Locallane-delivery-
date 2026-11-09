import { Bike, Home, IndianRupee, LayoutDashboard, Navigation, Package, Route, User, Users, type LucideIcon } from 'lucide-react'

export type DeliveryRole = 'super_admin' | 'manager' | 'staff' | 'rider'

const ROLES: DeliveryRole[] = ['super_admin', 'manager', 'staff', 'rider']

export function parseRole(v: unknown): DeliveryRole | null {
  return typeof v === 'string' && (ROLES as string[]).includes(v) ? (v as DeliveryRole) : null
}

export const ROLE_LABEL: Record<DeliveryRole, string> = {
  super_admin: 'Super Admin',
  manager: 'Delivery Manager',
  staff: 'Delivery Staff',
  rider: 'Rider',
}

export const OPS_ROLES: DeliveryRole[] = ['super_admin', 'manager', 'staff']
export const MANAGE_ROLES: DeliveryRole[] = ['super_admin', 'manager']

export function homeFor(role: DeliveryRole | null): string {
  if (role === 'rider') return '/rider'
  if (role) return '/ops'
  return '/no-access'
}

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  roles: DeliveryRole[]
}

export const OPS_NAV: NavItem[] = [
  { to: '/ops', label: 'Overview', icon: LayoutDashboard, end: true, roles: OPS_ROLES },
  { to: '/ops/orders', label: 'Orders', icon: Package, roles: OPS_ROLES },
  { to: '/ops/dispatch', label: 'Dispatch', icon: Route, roles: OPS_ROLES },
  { to: '/ops/riders', label: 'Riders', icon: Bike, roles: MANAGE_ROLES },
  { to: '/ops/finance', label: 'Finance', icon: IndianRupee, roles: MANAGE_ROLES },
  { to: '/ops/team', label: 'Team', icon: Users, roles: MANAGE_ROLES },
]

export const RIDER_NAV: NavItem[] = [
  { to: '/rider', label: 'Home', icon: Home, end: true, roles: ['rider'] },
  { to: '/rider/offers', label: 'Offers', icon: Package, roles: ['rider'] },
  { to: '/rider/trip', label: 'Trip', icon: Navigation, roles: ['rider'] },
  { to: '/rider/earnings', label: 'Earnings', icon: IndianRupee, roles: ['rider'] },
  { to: '/rider/profile', label: 'Profile', icon: User, roles: ['rider'] },
]

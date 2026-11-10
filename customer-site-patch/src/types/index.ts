import type { OpeningHours } from '../utils/hours'
import type { SiteContent } from '../utils/siteContent'
/* ---------- Shops and catalogue (data comes from Supabase) ---------- */

export type Plan = 'starter' | 'growth' | 'pro'

export interface Store {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  ratingAvg: number
  ratingCount: number
  openingHours: OpeningHours | null
  featuredProductIds: string[]
  latitude: number | null
  longitude: number | null
  verifiedAt: string | null
  siteContent: SiteContent
  theme: ShopTheme
  themeColor: string
  whatsapp: string | null
  phone: string | null
  address: string | null
  plan: Plan
  deliveryFee: number
  freeDeliveryAbove: number | null
  codEnabled: boolean
  pickupEnabled: boolean
}

export type ShopTheme = 'classic' | 'bold' | 'elegant' | 'fresh'

export interface Category {
  id: string
  name: string
}

export interface ProductSize {
  size: string
  qty: number
}

export interface Product {
  id: string
  storeId: string
  categoryId: string | null
  categoryName: string | null
  name: string
  description: string
  price: number
  /** Original price before discount (MRP). Equal to price when there is no discount. */
  mrp: number
  stock: number
  brand: string | null
  colour: string | null
  /** Empty when the product has no sizes. When used, stock is the total of all sizes. */
  sizes: ProductSize[]
  specifications: ProductSpec[]
  /** Set only while a Flash Deal is running. Then price is the deal price and mrp is the normal price. */
  deal: { endsAt: string; left: number | null } | null
  ratingAvg: number
  ratingCount: number
  images: string[]
  createdAt: string
}

export type UserRole = 'customer' | 'owner' | 'staff' | 'admin'

export type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'rating' | 'discount'

/* ---------- Orders ---------- */

export type DeliveryType = 'delivery' | 'pickup'

export type OrderStatus = 'new' | 'confirmed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled'

export interface PlacedOrder {
  orderId: string
  orderNo: number
  trackingToken: string
  total: number
}

/** What a customer sees when opening an order's tracking link. */
export interface OrderTracking {
  orderNo: number
  status: OrderStatus
  createdAt: string
  customerName: string
  address: string | null
  deliveryType: DeliveryType
  paymentMethod: 'cod'
  paymentStatus: 'pending' | 'paid'
  subtotal: number
  deliveryFee: number
  total: number
  deliveryPersonName: string | null
  deliveryPersonPhone: string | null
  store: { name: string; slug: string; whatsapp: string | null }
  items: { name: string; price: number; quantity: number }[]
}

/* ---------- Cart ---------- */

export interface CartItem {
  productId: string
  quantity: number
  size?: string
}

export interface CartLine {
  product: Product
  quantity: number
  size?: string
  /** Most pieces that can be bought of this line (per size when sizes are used). */
  max: number
}

/* ---------- Users ---------- */

export interface Address {
  fullName: string
  phone: string
  line1: string
  city: string
  state: string
  pincode: string
}

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  address?: Address
}

/* ---------- Owner panel ---------- */

export interface OwnerStore extends Store {
  ownerId: string
  isActive: boolean
  productLimit: number
  customDomain: string | null
  status: string
  showInMarketplace: boolean
  businessType: string | null
  city: string | null
}

export interface PanelProductImage {
  id: string
  url: string
}

export interface PanelProduct {
  id: string
  storeId: string
  categoryId: string | null
  globalCategoryId: string | null
  name: string
  description: string
  price: number
  mrp: number | null
  stock: number
  brand: string | null
  colour: string | null
  sizes: ProductSize[]
  specifications: ProductSpec[]
  dealPrice: number | null
  dealStartsAt: string | null
  dealEndsAt: string | null
  dealLimit: number | null
  dealSold: number
  isActive: boolean
  images: PanelProductImage[]
  createdAt: string
}

export interface PanelOrder {
  id: string
  trackingToken: string
  discount: number
  couponCode: string | null
  orderNo: number
  status: OrderStatus
  createdAt: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  address: string | null
  note: string | null
  deliveryType: DeliveryType
  paymentStatus: 'pending' | 'paid'
  subtotal: number
  deliveryFee: number
  total: number
  deliveryPersonName: string | null
  deliveryPersonPhone: string | null
  fulfilment: 'shop' | 'locallane'
  items: { name: string; price: number; quantity: number }[]
}

/* ---------- Admin panel ---------- */

export interface AdminStore extends OwnerStore {
  ownerEmail: string | null
  ownerName: string | null
}

export interface AdminUser {
  id: string
  email: string | null
  name: string | null
  role: UserRole
  createdAt: string
}

export interface AdminOrderRow {
  id: string
  orderNo: number
  storeName: string
  customerName: string
  total: number
  status: OrderStatus
  createdAt: string
}

export interface PlatformStats {
  shops: number
  activeShops: number
  users: number
  orders: number
  orders30d: number
  sales30d: number
}

/* ---------- Marketplace data ---------- */

export type Placement = 'home' | 'market'

export interface GlobalCategory {
  id: string
  parentId: string | null
  name: string
  slug: string
  icon: string | null
  sortOrder: number
  isActive: boolean
}

export interface Banner {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string
  linkUrl: string | null
  placement: Placement
  sortOrder: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
}

export interface FeaturedStore {
  id: string
  kind: 'platform' | 'partner'
  storeId: string | null
  slug: string | null
  name: string
  tagline: string | null
  logoUrl: string | null
  externalUrl: string | null
  placement: Placement[]
  sortOrder: number
  isActive: boolean
}

export interface MarketProduct {
  id: string
  storeId: string
  storeName: string
  storeSlug: string
  name: string
  price: number
  mrp: number
  stock: number
  imageUrl: string | null
  categoryName: string | null
  globalCategoryId: string | null
  discountPct: number
  createdAt: string
  hasSizes: boolean
  ratingAvg: number
  ratingCount: number
  dealEndsAt: string | null
  dealLeft: number | null
}

export interface MarketShop {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  description: string | null
  themeColor: string
  address: string | null
  ratingAvg: number
  ratingCount: number
  openingHours: OpeningHours | null
  productCount: number
  verified: boolean
}

export interface NearbyShop extends MarketShop {
  latitude: number
  longitude: number
  distanceKm: number
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryFee: number
  freeDeliveryAbove: number | null
}

export interface ProductSpec {
  label: string
  value: string
}

export type MarketSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'discount' | 'rating' | 'ending'

export interface MarketSearchParams {
  query?: string
  categoryId?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  storeId?: string
  sort?: MarketSort
  limit?: number
  offset?: number
  minRating?: number
  minDiscount?: number
  brand?: string
  size?: string
  dealsOnly?: boolean
}

/* ---------- Self-serve shop creation ---------- */

export interface ShopTemplate {
  key: string
  label: string
  icon: string
  themeColor: string
  description: string
  starterCategories: string[]
}

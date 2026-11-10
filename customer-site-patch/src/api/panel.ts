import { supabase } from '../lib/supabase'
import type { SiteContent } from '../utils/siteContent'
import type { OpeningHours } from '../utils/hours'
import { toStore } from './stores'
import type {
  Category,
  DeliveryType,
  OrderStatus,
  OwnerStore,
  PanelOrder,
  PanelProduct,
  PanelProductImage,
  ProductSize,
  ProductSpec,
  ShopTheme,
} from '../types'
import { parseSizes, parseSpecs } from '../utils/variants'

/** Turns a database error into a message an owner can understand. */
function panelError(error: { message: string; code?: string }, fallback = 'Something went wrong. Please try again.'): Error {
  if (error.code === 'P0001') return new Error(error.message) // our own rules, e.g. product limit
  if (error.code === '42501') return new Error('You do not have permission to do this.')
  if (error.code === '23505') return new Error('This value is already used. Please choose another one.')
  return new Error(fallback)
}

/* ---------------- stores ---------------- */

interface FullStoreRow {
  id: string
  owner_id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  cover_url: string | null
  rating_avg: number | string | null
  rating_count: number | null
  opening_hours: unknown
  featured_product_ids: string[] | null
  latitude: number | null
  longitude: number | null
  verified_at: string | null
  site_content: unknown
  theme: string | null
  theme_color: string
  whatsapp: string | null
  phone: string | null
  address: string | null
  plan: 'starter' | 'growth' | 'pro'
  product_limit: number
  is_active: boolean
  custom_domain: string | null
  status: string
  show_in_marketplace: boolean
  business_type: string | null
  city: string | null
  delivery_fee: number | string
  free_delivery_above: number | string | null
  cod_enabled: boolean
  pickup_enabled: boolean
}

export function toOwnerStore(row: FullStoreRow): OwnerStore {
  return {
    ...toStore(row),
    ownerId: row.owner_id,
    isActive: row.is_active,
    productLimit: row.product_limit,
    customDomain: row.custom_domain,
    status: row.status,
    showInMarketplace: row.show_in_marketplace,
    businessType: row.business_type,
    city: row.city,
  }
}

/** Owners see their own shops. Admins see every shop (for support). */
export async function listPanelStores(userId: string, all: boolean): Promise<OwnerStore[]> {
  let query = supabase.from('stores').select('*').order('created_at', { ascending: true })
  if (!all) query = query.eq('owner_id', userId)
  const { data, error } = await query
  if (error) throw panelError(error, 'Could not load your shops.')
  return ((data ?? []) as unknown as FullStoreRow[]).map(toOwnerStore)
}

export interface StoreSettingsInput {
  name: string
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  openingHours: OpeningHours | null
  featuredProductIds: string[]
  latitude: number | null
  longitude: number | null
  theme: ShopTheme
  themeColor: string
  whatsapp: string | null
  phone: string | null
  address: string | null
  deliveryFee: number
  freeDeliveryAbove: number | null
  codEnabled: boolean
  pickupEnabled: boolean
}

export async function updateStoreSettings(storeId: string, input: StoreSettingsInput): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({
      name: input.name,
      description: input.description,
      logo_url: input.logoUrl,
      cover_url: input.coverUrl,
      opening_hours: input.openingHours,
      featured_product_ids: input.featuredProductIds,
      latitude: input.latitude,
      theme: input.theme,
      longitude: input.longitude,
      theme_color: input.themeColor,
      whatsapp: input.whatsapp,
      phone: input.phone,
      address: input.address,
      delivery_fee: input.deliveryFee,
      free_delivery_above: input.freeDeliveryAbove,
      cod_enabled: input.codEnabled,
      pickup_enabled: input.pickupEnabled,
    })
    .eq('id', storeId)
  if (error) throw panelError(error, 'Could not save your shop settings.')
}

/* ---------------- photos ---------------- */

const BUCKET = 'store-assets'

export async function uploadStoreFile(storeId: string, folder: 'products' | 'logo' | 'cover', blob: Blob, contentType: string, extension: string): Promise<string> {
  const name = `${crypto.randomUUID()}.${extension}`
  const path = `${storeId}/${folder}/${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, cacheControl: '31536000' })
  if (error) throw new Error('Could not upload the photo. Please try again.')
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

function pathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

async function removeStoredFile(url: string): Promise<void> {
  const path = pathFromUrl(url)
  if (path) await supabase.storage.from(BUCKET).remove([path])
}

/* ---------------- categories ---------------- */

export async function createCategory(storeId: string, name: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ store_id: storeId, name: name.trim() })
    .select('id, name')
    .single()
  if (error || !data) throw panelError(error ?? { message: '' }, 'Could not add the category.')
  return data as Category
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) throw panelError(error, 'Could not delete the category.')
}

/* ---------------- products ---------------- */

interface PanelProductRow {
  id: string
  store_id: string
  category_id: string | null
  global_category_id: string | null
  name: string
  description: string | null
  price: number | string
  mrp: number | string | null
  stock: number
  brand: string | null
  colour: string | null
  sizes: unknown
  specifications: unknown
  deal_price: number | string | null
  deal_starts_at: string | null
  deal_ends_at: string | null
  deal_limit: number | null
  deal_sold: number | null
  is_active: boolean
  created_at: string
  product_images: { id: string; url: string; sort_order: number }[] | null
}

const PANEL_PRODUCT_SELECT =
  'id, store_id, category_id, global_category_id, name, description, price, mrp, stock, brand, colour, sizes, specifications, deal_price, deal_starts_at, deal_ends_at, deal_limit, deal_sold, is_active, created_at, product_images(id, url, sort_order)'

function toPanelProduct(row: PanelProductRow): PanelProduct {
  return {
    id: row.id,
    storeId: row.store_id,
    categoryId: row.category_id,
    globalCategoryId: row.global_category_id,
    name: row.name,
    description: row.description ?? '',
    price: Number(row.price),
    mrp: row.mrp === null ? null : Number(row.mrp),
    stock: row.stock,
    brand: row.brand,
    colour: row.colour,
    sizes: parseSizes(row.sizes),
    specifications: parseSpecs(row.specifications),
    dealPrice: row.deal_price === null ? null : Number(row.deal_price),
    dealStartsAt: row.deal_starts_at,
    dealEndsAt: row.deal_ends_at,
    dealLimit: row.deal_limit,
    dealSold: row.deal_sold ?? 0,
    isActive: row.is_active,
    images: [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ id: i.id, url: i.url })),
    createdAt: row.created_at,
  }
}

/** All products of a shop, including hidden ones. */
export async function listPanelProducts(storeId: string): Promise<PanelProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PANEL_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  if (error) throw panelError(error, 'Could not load products.')
  return ((data ?? []) as unknown as PanelProductRow[]).map(toPanelProduct)
}

export interface ProductInput {
  name: string
  description: string
  price: number
  mrp: number | null
  stock: number
  brand: string
  colour: string
  sizes: ProductSize[]
  specifications: ProductSpec[]
  dealPrice: number | null
  dealStartsAt: string | null
  dealEndsAt: string | null
  dealLimit: number | null
  categoryId: string | null
  globalCategoryId: string | null
  isActive: boolean
}

/** Creates a product (returns its id) or updates an existing one. */
export async function saveProduct(storeId: string, input: ProductInput, productId?: string): Promise<string> {
  const values = {
    name: input.name,
    description: input.description || null,
    price: input.price,
    mrp: input.mrp,
    stock: input.stock,
    brand: input.brand.trim() || null,
    colour: input.colour.trim() || null,
    sizes: input.sizes,
    specifications: input.specifications,
    deal_price: input.dealPrice,
    deal_starts_at: input.dealStartsAt,
    deal_ends_at: input.dealEndsAt,
    deal_limit: input.dealLimit,
    category_id: input.categoryId,
    global_category_id: input.globalCategoryId,
    is_active: input.isActive,
  }
  if (productId) {
    const { error } = await supabase.from('products').update(values).eq('id', productId)
    if (error) throw panelError(error, 'Could not save the product.')
    return productId
  }
  const { data, error } = await supabase.from('products').insert({ ...values, store_id: storeId }).select('id').single()
  if (error || !data) throw panelError(error ?? { message: '' }, 'Could not add the product.')
  return (data as { id: string }).id
}

export async function setProductActive(productId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', productId)
  if (error) throw panelError(error, 'Could not update the product.')
}

export async function setProductStock(productId: string, stock: number): Promise<void> {
  const { error } = await supabase.from('products').update({ stock }).eq('id', productId)
  if (error) throw panelError(error, 'Could not update the stock.')
}

export async function deleteProduct(product: PanelProduct): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', product.id)
  if (error) throw panelError(error, 'Could not delete the product.')
  await Promise.all(product.images.map((i) => removeStoredFile(i.url)))
}

export async function addProductImage(storeId: string, productId: string, url: string, sortOrder: number): Promise<PanelProductImage> {
  const { data, error } = await supabase
    .from('product_images')
    .insert({ product_id: productId, store_id: storeId, url, sort_order: sortOrder })
    .select('id, url')
    .single()
  if (error || !data) throw panelError(error ?? { message: '' }, 'Could not save the photo.')
  return data as PanelProductImage
}

export async function deleteProductImage(image: PanelProductImage): Promise<void> {
  const { error } = await supabase.from('product_images').delete().eq('id', image.id)
  if (error) throw panelError(error, 'Could not delete the photo.')
  await removeStoredFile(image.url)
}

/* ---------------- orders ---------------- */

interface PanelOrderRow {
  id: string
  tracking_token: string
  discount: number | string | null
  coupon_code: string | null
  order_no: number | string
  status: OrderStatus
  created_at: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  address: string | null
  note: string | null
  delivery_type: DeliveryType
  payment_status: 'pending' | 'paid'
  subtotal: number | string
  delivery_fee: number | string
  total: number | string
  delivery_person_name: string | null
  delivery_person_phone: string | null
  fulfilment: 'shop' | 'locallane' | null
  order_items: { name: string; price: number | string; quantity: number }[] | null
}

const PANEL_ORDER_SELECT =
  'id, tracking_token, discount, coupon_code, order_no, status, created_at, customer_name, customer_phone, customer_email, address, note, delivery_type, payment_status, subtotal, delivery_fee, total, delivery_person_name, delivery_person_phone, fulfilment, order_items(name, price, quantity)'

function toPanelOrder(row: PanelOrderRow): PanelOrder {
  return {
    id: row.id,
    trackingToken: row.tracking_token,
    discount: Number(row.discount ?? 0),
    couponCode: row.coupon_code,
    orderNo: Number(row.order_no),
    status: row.status,
    createdAt: row.created_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    address: row.address,
    note: row.note,
    deliveryType: row.delivery_type,
    paymentStatus: row.payment_status,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    deliveryPersonName: row.delivery_person_name,
    deliveryPersonPhone: row.delivery_person_phone,
    fulfilment: row.fulfilment === 'locallane' ? 'locallane' : 'shop',
    items: (row.order_items ?? []).map((i) => ({ name: i.name, price: Number(i.price), quantity: i.quantity })),
  }
}

export async function listPanelOrders(storeId: string, limit = 300): Promise<PanelOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(PANEL_ORDER_SELECT)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw panelError(error, 'Could not load orders.')
  return ((data ?? []) as unknown as PanelOrderRow[]).map(toPanelOrder)
}

export async function countNewOrders(storeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'new')
  if (error) return 0
  return count ?? 0
}

export interface OrderChanges {
  status?: OrderStatus
  paymentStatus?: 'pending' | 'paid'
  deliveryPersonName?: string | null
  deliveryPersonPhone?: string | null
  fulfilment?: 'shop' | 'locallane'
}

export async function updateOrder(orderId: string, changes: OrderChanges): Promise<void> {
  const values: Record<string, unknown> = {}
  if (changes.status !== undefined) values.status = changes.status
  if (changes.paymentStatus !== undefined) values.payment_status = changes.paymentStatus
  if (changes.deliveryPersonName !== undefined) values.delivery_person_name = changes.deliveryPersonName
  if (changes.deliveryPersonPhone !== undefined) values.delivery_person_phone = changes.deliveryPersonPhone
  if (changes.fulfilment !== undefined) values.fulfilment = changes.fulfilment
  const { error } = await supabase.from('orders').update(values).eq('id', orderId)
  if (error) throw panelError(error, 'Could not update the order.')
}

/** Saves the owner's shop-page content. The database re-checks every field (https links, lengths, counts). */
export async function updateSiteContent(storeId: string, content: SiteContent): Promise<void> {
  const { error } = await supabase.from('stores').update({ site_content: content }).eq('id', storeId)
  if (error) throw panelError(error, 'Could not save your shop page. Please try again.')
}

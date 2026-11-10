import { useCallback, useEffect, useState } from 'react'
import { Download, MessageCircle, Phone, Star } from 'lucide-react'
import { listPanelOrders, updateOrder, type OrderChanges } from '../../api/panel'
import { usePanel, usePanelStore } from '../../context/PanelContext'
import { useT } from '../../i18n'
import { useUiStore } from '../../store/uiStore'
import { whatsappLink } from '../../utils/contact'
import { downloadCsv } from '../../utils/csv'
import { cn, formatDateTime, formatPrice } from '../../utils/format'
import { statusLabel } from '../../utils/orders'
import type { OrderStatus, PanelOrder } from '../../types'

type Filter = 'all' | OrderStatus

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'packed', label: 'Packed' },
  { key: 'out_for_delivery', label: 'On the way' },
  { key: 'delivered', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
]

const TONE: Record<OrderStatus, string> = {
  new: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  packed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  out_for_delivery: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

function nextAction(order: PanelOrder): { status: OrderStatus; label: string } | null {
  switch (order.status) {
    case 'new':
      return { status: 'confirmed', label: 'Confirm order' }
    case 'confirmed':
      return { status: 'packed', label: order.deliveryType === 'pickup' ? 'Mark ready for pickup' : 'Mark packed' }
    case 'packed':
      if (order.deliveryType === 'delivery' && order.fulfilment === 'locallane') return null
      return order.deliveryType === 'pickup'
        ? { status: 'delivered', label: 'Mark picked up' }
        : { status: 'out_for_delivery', label: 'Send out for delivery' }
    case 'out_for_delivery':
      return { status: 'delivered', label: 'Mark delivered' }
    default:
      return null
  }
}

function OrderCard({ order, storeName, onChanged }: { order: PanelOrder; storeName: string; onChanged: () => void }) {
  const toast = useUiStore((s) => s.pushToast)
  const tr = useT()
  const [open, setOpen] = useState(order.status === 'new')
  const [busy, setBusy] = useState(false)
  const [courierName, setCourierName] = useState(order.deliveryPersonName ?? '')
  const [courierPhone, setCourierPhone] = useState(order.deliveryPersonPhone ?? '')

  const next = nextAction(order)
  const canChooseDelivery = order.deliveryType === 'delivery' && (order.status === 'new' || order.status === 'confirmed' || order.status === 'packed')
  const canCancel = order.status !== 'delivered' && order.status !== 'cancelled'
  const wa = whatsappLink(
    order.customerPhone,
    `Hello ${order.customerName}, your order #${order.orderNo} from ${storeName} is now: ${statusLabel(order.status, order.deliveryType)}.`,
  )

  const reviewWa =
    order.status === 'delivered'
      ? whatsappLink(
          order.customerPhone,
          `Hello ${order.customerName.split(' ')[0]}, thank you for ordering from ${storeName}! Please rate your order, it takes 20 seconds and helps us a lot: ${window.location.origin}/review/${order.trackingToken}`,
        )
      : null

  const apply = async (changes: OrderChanges, success: string) => {
    setBusy(true)
    try {
      await updateOrder(order.id, changes)
      toast(success)
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the order.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const advance = () => {
    if (!next) return
    const changes: OrderChanges = { status: next.status }
    if (next.status === 'out_for_delivery') {
      changes.deliveryPersonName = courierName.trim() || null
      changes.deliveryPersonPhone = courierPhone.trim() || null
    }
    void apply(changes, `Order #${order.orderNo}: ${statusLabel(next.status, order.deliveryType)}`)
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 dark:text-white">
            #{order.orderNo} · {order.customerName}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDateTime(order.createdAt)} · {order.deliveryType === 'pickup' ? tr('Pickup') : tr('Delivery')}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-bold text-slate-900 dark:text-white">{formatPrice(order.total)}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', TONE[order.status])}>
            {tr(statusLabel(order.status, order.deliveryType))}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200 p-4 text-sm dark:border-slate-800">
          <ul className="space-y-1">
            {order.items.map((i, idx) => (
              <li key={`${i.name}-${idx}`} className="flex justify-between gap-3">
                <span className="text-slate-700 dark:text-slate-300">
                  {i.name} <span className="text-slate-500">× {i.quantity}</span>
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatPrice(i.price * i.quantity)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-slate-200 pt-1 text-slate-600 dark:border-slate-700 dark:text-slate-400">
              <span>{tr('Delivery')}</span>
              <span>{order.deliveryFee === 0 ? tr('Free') : formatPrice(order.deliveryFee)}</span>
            </li>
            <li className="flex justify-between font-bold text-slate-900 dark:text-white">
              <span>{tr('Total')}</span>
              <span>{formatPrice(order.total)}</span>
            </li>
          </ul>

          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <p className="font-semibold text-slate-900 dark:text-white">{order.customerName}</p>
            <p className="text-slate-600 dark:text-slate-400">{order.customerPhone}</p>
            {order.customerEmail && <p className="text-slate-600 dark:text-slate-400">{order.customerEmail}</p>}
            {order.deliveryType === 'delivery' && order.address && (
              <p className="mt-2 whitespace-pre-line text-slate-700 dark:text-slate-300">{order.address}</p>
            )}
            {order.note && <p className="mt-2 italic text-slate-600 dark:text-slate-400">Note: {order.note}</p>}
            <div className="mt-3 flex gap-2">
              <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600 dark:text-white">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {tr('Call')}
              </a>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600 dark:text-white">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
                </a>
              )}
              {reviewWa && (
                <a href={reviewWa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" /> {tr('Ask for review')}
                </a>
              )}
            </div>
          </div>

          {canChooseDelivery && (
            <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Who delivers this order?</legend>
              {(['shop', 'locallane'] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <input
                    type="radio"
                    name={`fulfilment-${order.id}`}
                    checked={order.fulfilment === v}
                    disabled={busy}
                    onChange={() => void apply({ fulfilment: v }, v === 'locallane' ? 'LocalLane Delivery will handle this order' : 'You will deliver this order yourself')}
                  />
                  {v === 'shop' ? 'My own delivery' : 'LocalLane Delivery (a rider picks it up)'}
                </label>
              ))}
            </fieldset>
          )}

          {order.status === 'packed' && order.deliveryType === 'delivery' && order.fulfilment === 'locallane' && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
              Waiting for a LocalLane Delivery rider. The rider will pick this order up from you.
            </p>
          )}

          {order.status === 'packed' && order.deliveryType === 'delivery' && order.fulfilment === 'shop' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder={tr('Delivery person name (optional)')}
                aria-label="Delivery person name"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                value={courierPhone}
                onChange={(e) => setCourierPhone(e.target.value)}
                placeholder={tr('Delivery person phone (optional)')}
                aria-label="Delivery person phone"
                inputMode="tel"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <button type="button" disabled={busy} onClick={advance} className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
                {tr(next.label)}
              </button>
            )}
            {order.status !== 'cancelled' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply({ paymentStatus: order.paymentStatus === 'paid' ? 'pending' : 'paid' }, tr(order.paymentStatus === 'paid' ? 'Marked as unpaid' : 'Payment received'))}
                className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
              >
                {order.paymentStatus === 'paid' ? tr('Paid ✓ (undo)') : tr('Mark payment received')}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Cancel order #${order.orderNo}? The items will go back into stock.`)) {
                    void apply({ status: 'cancelled' }, `Order #${order.orderNo} cancelled`)
                  }
                }}
                className="rounded-xl px-4 py-2 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
              >
                {tr('Cancel order')}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function PanelOrders() {
  const store = usePanelStore()
  const tr = useT()
  const { ordersVersion, refreshNewCount } = usePanel()
  const [orders, setOrders] = useState<PanelOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    try {
      setOrders(await listPanelOrders(store.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders.')
    } finally {
      setLoading(false)
    }
  }, [store.id])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load, ordersVersion])

  const changed = () => {
    void load()
    refreshNewCount()
  }

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter)
  const countOf = (f: Filter) => (f === 'all' ? orders.length : orders.filter((o) => o.status === f).length)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{tr('Orders')}</h1>
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadCsv(`${store.slug}-orders.csv`, [
                ['Order', 'Date', 'Customer', 'Phone', 'Items', 'Type', 'Status', 'Payment', 'Total'],
                ...shown.map((o) => [o.orderNo, formatDateTime(o.createdAt), o.customerName, o.customerPhone, o.items.map((i) => `${i.name} x${i.quantity}`).join('; '), o.deliveryType, o.status, o.paymentStatus, o.total]),
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            CSV
          </button>
        )}
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium',
              filter === f.key
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
            )}
          >
            {tr(f.label)} ({countOf(f.key)})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-slate-500">{tr('Loading orders...')}</p>
      ) : error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {filter === 'all' ? tr('No orders yet. Share your shop link to get your first order.') : tr('No orders in this group.')}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => (
            <OrderCard key={o.id} order={o} storeName={store.name} onChanged={changed} />
          ))}
        </ul>
      )}
    </div>
  )
}

import {
  Clock3,
  ChefHat,
  Check,
  ShoppingBag,
  Package,
  Truck,
  CheckCircle2,
  Ban,
  Store,
  MessageSquare,
  Utensils,
  Coins,
  QrCode,
  Shuffle,
  AlertCircle,
  Gift,
} from 'lucide-react'
import type { FulfillmentType, OrderSource, OrderStatus, PaymentSummary } from '../../types'
import { formatCurrency } from '../../lib/format'

const styles: Record<OrderStatus, string> = {
  pending: 'border border-[#FF6A00]/40 bg-[#FF6A00]/15 text-[#FF9E4A]',
  preparing: 'border border-amber-500/40 bg-amber-500/15 text-amber-400',
  ready: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
  ready_for_pickup: 'border border-blue-500/40 bg-blue-500/15 text-blue-400',
  ready_for_dispatch: 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-400',
  out_for_delivery: 'border border-purple-500/40 bg-purple-500/15 text-purple-400',
  delivered: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  cancelled: 'border border-rose-500/40 bg-rose-500/15 text-rose-400',
}

const labels: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  preparing: 'En preparacion',
  ready: 'Listo',
  ready_for_pickup: 'Listo para retirar',
  ready_for_dispatch: 'Listo para despachar',
  out_for_delivery: 'En delivery',
  delivered: 'Entregado',
  cancelled: 'Eliminado',
}

const statusIcons: Record<OrderStatus, typeof Clock3> = {
  pending: Clock3,
  preparing: ChefHat,
  ready: Check,
  ready_for_pickup: ShoppingBag,
  ready_for_dispatch: Package,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
  cancelled: Ban,
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const Icon = statusIcons[status] || Clock3
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] ?? styles.pending}`}>
      <Icon size={12} className="shrink-0" />
      {labels[status] ?? status}
    </span>
  )
}

const sourceLabels: Record<OrderSource, string> = {
  local: 'LOCAL',
  whatsapp: 'WHATSAPP',
}

const sourceStyles: Record<OrderSource, string> = {
  local: 'bg-[#1A1A1A] border-[#333333] text-[#CCCCCC]',
  whatsapp: 'bg-emerald-950/40 border-emerald-800 text-emerald-300',
}

const sourceIcons: Record<OrderSource, typeof Store> = {
  local: Store,
  whatsapp: MessageSquare,
}

export function SourceBadge({ source }: { source: OrderSource }) {
  const Icon = sourceIcons[source] || Store
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-black uppercase tracking-wider ${sourceStyles[source] ?? sourceStyles.local}`}>
      <Icon size={13} className="shrink-0" />
      {sourceLabels[source] ?? 'LOCAL'}
    </span>
  )
}

const fulfillmentLabels: Record<FulfillmentType, string> = {
  table: 'MESA',
  pickup: 'RECOJO',
  delivery: 'DELIVERY',
}

const fulfillmentStyles: Record<FulfillmentType, string> = {
  table: 'bg-indigo-950/40 border-indigo-800 text-indigo-300',
  pickup: 'bg-amber-950/40 border-amber-800 text-amber-300',
  delivery: 'bg-pink-950/40 border-pink-800 text-pink-300',
}

const fulfillmentIcons: Record<FulfillmentType, typeof Utensils> = {
  table: Utensils,
  pickup: ShoppingBag,
  delivery: Truck,
}

export function FulfillmentBadge({ type, source = 'local' }: { type: FulfillmentType; tableInfo?: string; source?: OrderSource }) {
  const Icon = fulfillmentIcons[type] || Utensils
  const label = type === 'table'
    ? 'MESA'
    : type === 'pickup' && source === 'local'
      ? 'PARA LLEVAR'
      : fulfillmentLabels[type]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1 text-xs font-black uppercase tracking-wider ${fulfillmentStyles[type] ?? fulfillmentStyles.table}`}>
      <Icon size={13} className="shrink-0" />
      {label}
    </span>
  )
}

export function PaymentBadge({
  paymentStatus,
  paymentMethod,
  qrProofReceived = false,
}: {
  paymentStatus: 'paid' | 'pending' | 'gift'
  paymentMethod?: string | null
  qrProofReceived?: boolean
}) {
  if (paymentStatus === 'gift') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-950/40 border border-purple-800 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-purple-300">
        <Gift size={13} className="shrink-0" />
        REGALO
      </span>
    )
  }

  if (paymentStatus === 'paid') {
    const method = paymentMethod || 'cash'
    let Icon = Coins
    let label = 'EFECTIVO'
    if (method === 'qr') {
      Icon = QrCode
      label = 'QR'
    } else if (method === 'mixed') {
      Icon = Shuffle
      label = 'MIXTO'
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-300">
        <Icon size={13} className="shrink-0" />
        {method === 'qr' ? 'PAGADO CON QR' : `PAGADO · ${label}`}
      </span>
    )
  }

  if (qrProofReceived) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-300"
        title="Comprobante QR recibido; caja debe confirmar el pago"
      >
        <QrCode size={13} className="shrink-0" />
        PAGADO CON QR
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-rose-950/40 border border-rose-800 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-rose-300">
      <AlertCircle size={13} className="shrink-0" />
      PENDIENTE DE PAGO
    </span>
  )
}


/**
 * Detalle del cobro: cuanto entro por cada via. Se muestra debajo de las etiquetas del pedido.
 *
 * La etiqueta de pago sola dice "QR" o "MIXTO", pero no cuanto fue por cada lado ni si el QR se
 * repartio entre varias cuentas. Sin esto, un cobro repartido quedaba registrado pero no habia
 * forma de verlo en ningun lado, que es justo lo que hace falta para cuadrar contra el banco.
 *
 * No se muestra nada en los cobros simples (todo en efectivo, o un solo QR): ahi la etiqueta ya
 * lo dice todo y una linea extra solo seria ruido.
 */
export function PaymentBreakdown({ payment, paymentStatus }: { payment: PaymentSummary; paymentStatus: 'paid' | 'pending' | 'gift' }) {
  if (paymentStatus !== 'paid') return null

  const cuentas = payment.qrCuentas ?? []
  const esMixto = payment.method === 'mixed'
  if (!esMixto && cuentas.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-muted">
      {esMixto ? (
        <span>
          Efectivo <span className="font-black text-ink">{formatCurrency(payment.cashAmount)}</span>
          {' · '}
          QR <span className="font-black text-ink">{formatCurrency(payment.qrAmount)}</span>
        </span>
      ) : null}
      {cuentas.length > 0 ? (
        <span className="text-accent">
          QR en {cuentas.length} cuentas: <span className="font-black">{cuentas.map((monto) => formatCurrency(monto)).join(' + ')}</span>
        </span>
      ) : null}
    </div>
  )
}

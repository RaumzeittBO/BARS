import type { Order } from '../types'

export type OrderSourceFilter = 'all' | 'local' | 'whatsapp'

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function canonicalProductKey(name: string, basePrice: number) {
  const normalized = normalize(name).replace(/\s+/g, ' ').trim()
  return `product:${normalized}:${Number(basePrice)}`
}

function canonicalExtraKey(name: string) {
  const normalized = normalize(name)
    .replace(/\b(?:extra|adicional)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `extra:${normalized}`
}

function parseDayKeyLocal(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function getItemLineTotal(item: Order['items'][number]) {
  const storedLineTotal = Number(item.lineTotal)
  if (Number.isFinite(storedLineTotal)) return storedLineTotal

  const extrasTotal = (item.modifiers?.extras || []).reduce(
    (sum, extra) => sum + Number(extra.price || 0) * item.quantity,
    0,
  )
  return Number(item.basePrice || 0) * item.quantity + extrasTotal
}

// Un pedido entra en el rango si su DIA esta entre las dos fechas, ambas incluidas. Se compara
// por dia y no por hora para que "del 28 de julio al 5 de agosto" incluya el 5 completo y no
// corte a medianoche. Si las fechas vienen al reves se ordenan solas, asi elegirlas en cualquier
// orden en los dos calendarios no deja la pantalla en blanco.
export function isOrderDateBetween(
  orderDateValue: string | Date | undefined,
  fromDayKey: string,
  toDayKey: string,
) {
  if (!orderDateValue) return false
  const orderDate = new Date(orderDateValue)
  const first = parseDayKeyLocal(fromDayKey)
  const last = parseDayKeyLocal(toDayKey)
  if (Number.isNaN(orderDate.getTime()) || !first || !last) return false

  const orderMidnight = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate()).getTime()
  const start = Math.min(first.getTime(), last.getTime())
  const end = Math.max(first.getTime(), last.getTime())

  return orderMidnight >= start && orderMidnight <= end
}

export function filterOrdersBySource(orders: Order[], source: OrderSourceFilter) {
  if (source === 'all') return orders
  return orders.filter((order) => order.orderSource === source)
}

export function getOrderProductTotal(order: Order) {
  if (order.items.length > 0) {
    const lineTotal = order.items.reduce((sum, item) => sum + getItemLineTotal(item), 0)
    if (Number.isFinite(lineTotal)) return lineTotal
  }

  return Number(order.productSubtotal ?? order.total ?? 0)
}

export interface ProductSaleRow {
  name: string
  type: 'Producto' | 'Extra'
  quantity: number
  revenue: number
}

export function aggregateProductSales(orders: Order[]): ProductSaleRow[] {
  const totals = new Map<string, ProductSaleRow>()

  const add = (name: string, type: ProductSaleRow['type'], quantity: number, revenue: number, basePrice = 0) => {
    const key = type === 'Producto'
      ? canonicalProductKey(name, basePrice)
      : canonicalExtraKey(name)
    const current = totals.get(key) || { name, type, quantity: 0, revenue: 0 }
    current.quantity += quantity
    current.revenue += revenue
    totals.set(key, current)
  }

  orders.filter((order) => order.status !== 'cancelled').forEach((order) => {
    const countsAsRevenue = order.paymentStatus !== 'gift'
    order.items.forEach((item) => {
      const lineRevenue = countsAsRevenue ? getItemLineTotal(item) : 0
      const extras = item.modifiers?.extras || []
      const calculatedExtrasRevenue = countsAsRevenue
        ? extras.reduce((sum, extra) => sum + Number(extra.price || 0) * item.quantity, 0)
        : 0
      const extrasRevenue = Math.min(lineRevenue, calculatedExtrasRevenue)
      add(item.name, 'Producto', item.quantity, lineRevenue - extrasRevenue, item.basePrice)
      extras.forEach((extra) => {
        const revenue = calculatedExtrasRevenue > 0
          ? extrasRevenue * ((Number(extra.price || 0) * item.quantity) / calculatedExtrasRevenue)
          : 0
        add(extra.name, 'Extra', item.quantity, revenue)
      })
    })
  })

  return [...totals.values()].sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name))
}

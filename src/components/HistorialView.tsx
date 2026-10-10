import { Download, Filter, Gift, ScrollText, Trash2, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { downloadTextFile, formatCurrency, formatDateTime, formatExtrasList, formatPaymentMethod, formatTime } from '../lib/format'
import {
  aggregateProductSales,
  filterOrdersBySource,
  getOrderProductTotal,
  isOrderDateBetween,
} from '../lib/orderReports'
import type { OrderSourceFilter } from '../lib/orderReports'
import type { Order, OrderStatus } from '../types'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'
import { StatusPill, SourceBadge, FulfillmentBadge, PaymentBadge, PaymentBreakdown } from './ui/StatusPill'

type HistoryFilter = 'all' | 'gift' | 'table' | 'local_pickup' | 'delivery' | 'whatsapp_pickup' | 'cancelled'

const filterOptions: Array<{ value: HistoryFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'gift', label: 'Regalo' },
  { value: 'table', label: 'Mesa' },
  { value: 'local_pickup', label: 'Para llevar' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'whatsapp_pickup', label: 'Recojo' },
  { value: 'cancelled', label: 'Pedidos eliminados' },
]

function toDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayKey(now = new Date()) {
  return toDayKey(now)
}

function formatDayLabel(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dayKey
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Atajos de rango. Son solo comodidad: las dos fechas siguen siendo libres y editables. */
function rangeShortcuts(now = new Date()) {
  const inicioMesActual = new Date(now.getFullYear(), now.getMonth(), 1)
  const inicioMesPasado = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const finMesPasado = new Date(now.getFullYear(), now.getMonth(), 0)
  const inicioAno = new Date(now.getFullYear(), 0, 1)
  return [
    { id: 'mes-actual', label: 'Este mes', from: toDayKey(inicioMesActual), to: toDayKey(now) },
    { id: 'mes-pasado', label: 'Mes pasado', from: toDayKey(inicioMesPasado), to: toDayKey(finMesPasado) },
    { id: 'ano', label: 'Este año', from: toDayKey(inicioAno), to: toDayKey(now) },
  ]
}

function getOrderSaleAmount(order: Order) {
  if (order.paymentStatus === 'gift') return 0
  return getOrderProductTotal(order)
}

export function HistorialView({
  orders,
  onAdvanceStatus,
  onDeleteOrder,
  userName,
  userRole,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  onDeleteOrder: (orderId: string, deletedBy?: string) => Promise<void>
  userName: string
  userRole: string
}) {
  const dayOptions = useMemo(() => {
    const options: string[] = []
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      options.push(`${year}-${month}-${day}`)
    }
    return options
  }, [])

  const [selectedDayKey, setSelectedDayKey] = useState<string>(dayOptions[0] ?? getTodayKey())
  // 'day' mira un solo dia; 'range' deja elegir desde y hasta con total libertad (dias, semanas,
  // meses, lo que sea). Los presets fijos de 7 y 30 dias ya no hacen falta: el rango los cubre.
  const [dateMode, setDateMode] = useState<'day' | 'range'>('day')
  const [rangeFrom, setRangeFrom] = useState<string>(dayOptions[6] ?? getTodayKey())
  const [rangeTo, setRangeTo] = useState<string>(dayOptions[0] ?? getTodayKey())
  const [sourceFilter, setSourceFilter] = useState<OrderSourceFilter>('all')
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  // Las fechas se ordenan solas: si el dueño elige primero el "hasta" y despues un "desde"
  // posterior, igual ve algo en vez de una pantalla vacia sin explicacion.
  const [periodFrom, periodTo] = useMemo(() => {
    if (dateMode === 'day') return [selectedDayKey, selectedDayKey]
    return rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom]
  }, [dateMode, selectedDayKey, rangeFrom, rangeTo])

  const periodLabel = useMemo(
    () => (periodFrom === periodTo ? formatDayLabel(periodFrom) : `${formatDayLabel(periodFrom)} al ${formatDayLabel(periodTo)}`),
    [periodFrom, periodTo],
  )

  const periodFileTag = periodFrom === periodTo ? periodFrom : `${periodFrom}_a_${periodTo}`

  const selectedDayOrders = useMemo(() => {
    return filterOrdersBySource(
      orders.filter((order) => isOrderDateBetween(order.createdAt, periodFrom, periodTo)),
      sourceFilter,
    )
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }, [orders, periodFrom, periodTo, sourceFilter])

  const filteredOrders = useMemo(
    () => (
      selectedDayOrders.filter((order) => {
        if (filter === 'cancelled') return order.status === 'cancelled'
        if (order.status === 'cancelled') return false
        if (filter === 'all') return true
        if (filter === 'gift') return order.paymentStatus === 'gift'
        if (filter === 'table') return order.orderSource === 'local' && order.fulfillmentType === 'table'
        if (filter === 'local_pickup') return order.orderSource === 'local' && order.fulfillmentType === 'pickup'
        if (filter === 'delivery') return order.fulfillmentType === 'delivery'
        if (filter === 'whatsapp_pickup') return order.orderSource === 'whatsapp' && order.fulfillmentType === 'pickup'
        return false
      })
    ),
    [filter, selectedDayOrders],
  )

  const summary = useMemo(() => {
    // Pedidos activos creados en el rango seleccionado
    const activeCreatedOrders = selectedDayOrders.filter((order) => order.status !== 'cancelled')
    
    // El cobro pertenece al dia original del pedido. Cobrar hoy un pedido de ayer no mueve la venta.
    const activePaidOrders = selectedDayOrders.filter((order) => {
      if (order.status === 'cancelled') return false
      if (order.paymentStatus !== 'paid') return false
      return true
    })

    // Pedidos activos con cobro pendiente creados en el rango seleccionado
    const activePendingPaymentOrders = activeCreatedOrders.filter((order) => order.paymentStatus === 'pending')

    const topProducts = aggregateProductSales(activeCreatedOrders)
      .filter((item) => item.type === 'Producto')
      .slice(0, 5)
      .map(({ name, quantity }) => ({ name, quantity }))

    // Totales de pago usando solo pedidos pagados en el rango seleccionado
    const paymentTotals = activePaidOrders.reduce(
      (accumulator, order) => {
        accumulator.cashSales += order.payment.cashAmount
        accumulator.qrSales += order.payment.qrAmount
        accumulator.cashReceived += order.payment.cashReceived
        accumulator.change += order.payment.change
        if (order.payment.method === 'mixed') {
          accumulator.mixedCount += 1
        }
        return accumulator
      },
      {
        cashSales: 0,
        qrSales: 0,
        cashReceived: 0,
        change: 0,
        mixedCount: 0,
      },
    )

    const totalSales = activeCreatedOrders.reduce((sum, order) => sum + getOrderSaleAmount(order), 0)
    const paidSales = activePaidOrders.reduce((sum, order) => sum + getOrderSaleAmount(order), 0)
    const pendingPaymentTotal = activePendingPaymentOrders.reduce((sum, order) => sum + getOrderSaleAmount(order), 0)

    const deliveredCount = activeCreatedOrders.filter((order) => order.status === 'delivered').length

    return {
      totalSales,
      paidSales,
      pendingPaymentTotal,
      pendingPaymentCount: activePendingPaymentOrders.length,
      orderCount: activeCreatedOrders.length,
      averageTicket: activePaidOrders.length ? paidSales / activePaidOrders.length : 0,
      pending: activeCreatedOrders.filter((order) => order.status === 'pending').length,
      preparing: activeCreatedOrders.filter((order) => order.status === 'preparing').length,
      ready: activeCreatedOrders.filter((order) => order.status === 'ready').length,
      delivered: deliveredCount,
      paymentTotals,
      topProducts,
    }
  }, [selectedDayOrders])

  const productSales = useMemo(() => aggregateProductSales(selectedDayOrders), [selectedDayOrders])

  const giftOrders = useMemo(
    () => selectedDayOrders.filter((order) => order.status !== 'cancelled' && order.paymentStatus === 'gift'),
    [selectedDayOrders],
  )

  const exportCsv = () => {
    const csvOrders = selectedDayOrders.filter((order) => order.status !== 'cancelled')
    const summaryRows = [
      ['resumen', 'valor'],
      ['ventas_totales_registradas', summary.totalSales],
      ['cobrado_en_periodo', summary.paidSales],
      ['pendiente_cobro', summary.pendingPaymentTotal],
      ['cantidad_pedidos_activos', summary.orderCount],
      ['ticket_promedio_cobrado', summary.averageTicket],
      ['pendientes_cocina', summary.pending],
      ['en_preparacion', summary.preparing],
      ['listos', summary.ready],
      ['entregados', summary.delivered],
      ['efectivo_cobrado', summary.paymentTotals.cashSales],
      ['qr_cobrado', summary.paymentTotals.qrSales],
      ['pedidos_mixtos_cantidad', summary.paymentTotals.mixedCount],
      ['efectivo_recibido', summary.paymentTotals.cashReceived],
      ['cambio_entregado', summary.paymentTotals.change],
      [],
      [
        'numero',
        'origen',
        'hora_creacion',
        'hora_listo',
        'hora_entregado',
        'estado',
        'modalidad',
        'info_mesa',
        'cliente_nombre',
        'cliente_telefono',
        'direccion_entrega',
        'estado_pago',
        'metodo_pago',
        'monto_efectivo',
        'monto_qr',
        'qr_por_cuenta',
        'recibido_efectivo',
        'cambio',
        'fecha_hora_pago',
        'usuario_pago',
        'items',
        'detalle_productos',
        'observaciones',
        'total',
      ],
    ]

    const orderRows = csvOrders.map((order) => {
      const isPaid = order.paymentStatus === 'paid'
      return [
        order.displayNumber,
        order.orderSource || 'local',
        formatDateTime(order.createdAt),
        formatDateTime(order.readyAt),
        formatDateTime(order.deliveredAt),
        order.status,
        order.fulfillmentType || (order.orderType === 'delivery' ? 'delivery' : 'table'),
        order.tableInfo ?? '',
        order.customerName ?? '',
        order.customerPhone ?? '',
        order.deliveryAddress ?? '',
        isPaid ? 'Pagado' : 'Pendiente',
        isPaid && order.paymentMethod ? formatPaymentMethod(order.paymentMethod) : 'Pendiente',
        isPaid ? order.payment.cashAmount : 0,
        isPaid ? order.payment.qrAmount : 0,
        // Detalle de cuanto entro por cada cuenta cuando el QR se cobro repartido. Vacio en
        // los pagos normales, que son la mayoria.
        isPaid && order.payment.qrCuentas?.length ? order.payment.qrCuentas.join(' + ') : '',
        isPaid ? order.payment.cashReceived : 0,
        isPaid ? order.payment.change : 0,
        isPaid && order.paidAt ? formatDateTime(order.paidAt) : '',
        isPaid && order.paidBy ? order.paidBy.replace('mock-', '') : '',
        order.items.reduce((sum, item) => sum + item.quantity, 0),
        order.items
          .map((item) => {
            const fragments = [`${item.quantity}x ${item.name}`]

            if (item.modifiers.extras.length) {
              fragments.push(`extras: ${item.modifiers.extras.map((extra) => extra.name).join('|')}`)
            }

            if (item.modifiers.options.length) {
              fragments.push(`opciones: ${item.modifiers.options.join('|')}`)
            }

            if (item.modifiers.note) {
              fragments.push(`obs: ${item.modifiers.note}`)
            }

            return fragments.join(' / ')
          })
          .join(' | '),
        order.items
          .map((item) => item.modifiers.note)
          .filter(Boolean)
          .join(' | '),
        String(getOrderSaleAmount(order)),
      ]
    })

    const csv = [...summaryRows, ...orderRows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';'))
      .join('\n')

    downloadTextFile(`bars-${periodFileTag}.csv`, csv)
  }

  const exportExcel = () => {
    const escapeCell = (value: unknown) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
    const row = (cells: unknown[], header = false) => `<tr>${cells.map((cell) => `<${header ? 'th' : 'td'}>${escapeCell(cell)}</${header ? 'th' : 'td'}>`).join('')}</tr>`
    const activeOrders = selectedDayOrders.filter((order) => order.status !== 'cancelled')

    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif}table{border-collapse:collapse;margin-bottom:24px}th,td{border:1px solid #bbb;padding:6px 8px}th{background:#FF6A00;color:#fff}h2{color:#FF6A00}
    </style></head><body>
      <h1>BARS — Sistema de Gestión - ${escapeCell(periodLabel)}</h1>
      <h2>Resumen</h2><table>
        ${row(['Concepto', 'Valor'], true)}
        ${row(['Ventas registradas', summary.totalSales])}
        ${row(['Cobrado', summary.paidSales])}
        ${row(['Pendiente de cobro', summary.pendingPaymentTotal])}
        ${row(['Pedidos activos', summary.orderCount])}
        ${row(['Regalos', giftOrders.length])}
      </table>
      <h2>Productos y extras</h2><table>
        ${row(['Tipo', 'Producto o extra', 'Cantidad', 'Ingreso'], true)}
        ${productSales.map((item) => row([item.type, item.name, item.quantity, item.revenue])).join('')}
      </table>
      <h2>Pedidos</h2><table>
        ${row(['Numero', 'Fecha', 'Origen', 'Modalidad', 'Cliente', 'Telefono', 'Pago', 'Metodo', 'Productos', 'Total'], true)}
        ${activeOrders.map((order) => row([
          order.displayNumber,
          formatDateTime(order.createdAt),
          order.orderSource,
          order.fulfillmentType,
          order.customerName || 'Cliente General',
          order.customerPhone || '',
          order.paymentStatus,
          order.paymentMethod ? formatPaymentMethod(order.paymentMethod) : '',
          order.items.map((item) => `${item.quantity}x ${item.name}`).join(' | '),
          getOrderSaleAmount(order),
        ])).join('')}
      </table>
    </body></html>`

    downloadTextFile(`bars-${periodFileTag}.xls`, html, 'application/vnd.ms-excel;charset=utf-8;')
  }

  const handleDeleteClick = async (order: Order) => {
    const confirmed = window.confirm(
      `Eliminar ${order.displayNumber}? Dejara de contar en ventas e insumos, pero quedara registrado en Pedidos eliminados.`,
    )
    if (!confirmed) return

    setBusyOrderId(order.id)
    try {
      await onDeleteOrder(order.id, userName || 'Usuario')
      setFilter('cancelled')
    } finally {
      setBusyOrderId(null)
    }
  }

  if (userRole === 'pedidos') {
    return (
      <div className="rounded-[1.8rem] border border-orange-200 bg-orange-50/60 p-6 text-center text-sm font-semibold text-orange-950">
        No tienes permisos para acceder a esta sección.
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <Panel className="border-white/80 bg-white/70 p-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">Historial y cierre</p>
              <h2 className="mt-2 font-serif text-3xl text-ink">Pedidos del Negocio</h2>
              <p className="mt-1 max-w-3xl text-xs text-muted">
                Resumen de ventas y arqueo por métodos de pago. Mira un día suelto o elige el rango
                de fechas que quieras.
              </p>
              <p className="mt-1 text-xs font-bold text-ink">{periodLabel}</p>
            </div>

            {/* Controles de Fecha */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Dia suelto o rango libre */}
              <div className="flex gap-1 bg-panel p-1 rounded-xl border border-line shadow-insetSoft">
                {[
                  { id: 'day', label: 'Día' },
                  { id: 'range', label: 'Rango de fechas' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`px-3 py-2 rounded-lg text-xs font-black tracking-wider transition ${
                      dateMode === option.id
                        ? 'bg-ink text-white shadow-sm'
                        : 'text-muted hover:text-ink'
                    }`}
                    onClick={() => {
                      setDateMode(option.id as 'day' | 'range')
                      setFilter('all')
                    }}
                  >
                    {option.label.toUpperCase()}
                  </button>
                ))}
              </div>

              {dateMode === 'day' ? (
                <input
                  type="date"
                  value={selectedDayKey}
                  onChange={(event) => setSelectedDayKey(event.target.value)}
                  className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold text-ink outline-none focus:border-accent shadow-sm"
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-sm">
                  <label className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted">Desde</span>
                    <input
                      type="date"
                      value={rangeFrom}
                      onChange={(event) => setRangeFrom(event.target.value)}
                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-bold text-ink outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted">Hasta</span>
                    <input
                      type="date"
                      value={rangeTo}
                      onChange={(event) => setRangeTo(event.target.value)}
                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-bold text-ink outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}

              <div className="flex gap-1 rounded-xl border border-line bg-panel p-1 shadow-insetSoft">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'local', label: 'Pedidos local' },
                  { id: 'whatsapp', label: 'Pedidos WhatsApp' },
                ].map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                      sourceFilter === source.id
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted hover:text-ink'
                    }`}
                    onClick={() => {
                      setSourceFilter(source.id as OrderSourceFilter)
                      setFilter('all')
                    }}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Accesos rapidos: ultimos dias en modo Dia, periodos comunes en modo Rango */}
          {dateMode === 'day' ? (
            <div className="flex flex-wrap gap-1.5 border-t border-dashed border-line pt-3">
              {dayOptions.map((dayKey) => {
                const date = new Date(dayKey + 'T00:00:00')
                const formattedDate = date.toLocaleDateString('es-ES', {
                  weekday: 'short',
                  day: 'numeric',
                })
                const isSelected = selectedDayKey === dayKey
                return (
                  <button
                    key={dayKey}
                    onClick={() => {
                      setSelectedDayKey(dayKey)
                      setFilter('all')
                    }}
                    className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-white border border-line text-muted hover:bg-panel hover:text-ink'
                    }`}
                  >
                    {dayKey === getTodayKey() ? 'Hoy' : formattedDate}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-line pt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted">Atajos</span>
              {rangeShortcuts().map((shortcut) => {
                const isSelected = rangeFrom === shortcut.from && rangeTo === shortcut.to
                return (
                  <button
                    key={shortcut.id}
                    type="button"
                    onClick={() => {
                      setRangeFrom(shortcut.from)
                      setRangeTo(shortcut.to)
                      setFilter('all')
                    }}
                    className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-white border border-line text-muted hover:bg-panel hover:text-ink'
                    }`}
                  >
                    {shortcut.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Grid de Métricas y Estadísticas */}
          <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-t border-dashed border-line pt-4">
            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Ventas registradas</div>
              <div className="mt-2 text-xl font-black text-ink">{formatCurrency(summary.totalSales)}</div>
              <div className="mt-0.5 text-[10px] text-muted font-bold">{summary.orderCount} pedidos</div>
            </div>
            
            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Cobrado en rango</div>
              <div className="mt-2 text-xl font-black text-ink">{formatCurrency(summary.paidSales)}</div>
            </div>

            {summary.pendingPaymentCount > 0 ? (
              <div className="rounded-[1.4rem] border border-[#ead7ad] bg-warningSoft p-4 shadow-insetSoft">
                <div className="text-[10px] font-black uppercase tracking-wider text-warning">Por cobrar</div>
                <div className="mt-2 text-xl font-black text-warning">{formatCurrency(summary.pendingPaymentTotal)}</div>
                <div className="mt-0.5 text-[10px] text-warning/80 font-bold">{summary.pendingPaymentCount} pedidos</div>
              </div>
            ) : (
              <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted">Por cobrar</div>
                <div className="mt-2 text-xl font-black text-ink">Bs 0</div>
              </div>
            )}

            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Ticket promedio</div>
              <div className="mt-2 text-xl font-black text-ink">{formatCurrency(summary.averageTicket)}</div>
            </div>

            <div className="rounded-[1.4rem] border border-white/80 bg-panel/95 p-4 shadow-insetSoft">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted">Pedidos Entregados</div>
              <div className="mt-2 text-xl font-black text-ink">{summary.delivered}</div>
            </div>

          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Panel className="border-white/85 bg-white/80 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentWash text-accent">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink">Cierre del periodo</h3>
              <p className="text-sm text-muted">Arqueo basico listo para caja y reporte operativo (excluye pedidos eliminados).</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.3rem] border border-line bg-panel/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Efectivo cobrado</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.cashSales)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">QR cobrado</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.qrSales)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Pedidos mixtos</div>
              <div className="mt-2 text-xl font-semibold text-ink">{summary.paymentTotals.mixedCount} pedidos</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recibido efectivo</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.cashReceived)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-line bg-panel/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Cambio entregado</div>
              <div className="mt-2 text-xl font-semibold text-ink">{formatCurrency(summary.paymentTotals.change)}</div>
            </div>
            <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Caja balanceada</div>
              <div className="mt-2 text-sm font-semibold text-emerald-950">
                Efectivo + QR coincide con total cobrado
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="border-white/85 bg-white/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink">Productos vendidos</h3>
              <p className="text-sm text-muted">Productos y extras registrados en el rango seleccionado.</p>
            </div>
            <div className="flex gap-2">
              <Button tone="secondary" onClick={exportCsv}>CSV</Button>
              <Button tone="secondary" onClick={exportExcel}>
                <Download size={16} />
                Excel
              </Button>
            </div>
          </div>

          <div className="mt-5 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {productSales.map((product) => (
              <div key={`${product.type}-${product.name}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-line bg-panel/80 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{product.name}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted">{product.type}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted">Cantidad</div>
                  <div className="font-black text-ink">{product.quantity}</div>
                </div>
                <div className="min-w-20 text-right">
                  <div className="text-[10px] uppercase text-muted">Ingreso</div>
                  <div className="font-black text-ink">{formatCurrency(product.revenue)}</div>
                </div>
              </div>
            ))}

            {productSales.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-lineStrong bg-canvas/50 p-6 text-center text-sm text-muted">
                No hay productos registrados en este rango.
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel className="border-purple-200 bg-purple-50/55 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-100 text-purple-700"><Gift size={18} /></div>
            <div>
              <h3 className="font-semibold text-ink">Regalos</h3>
              <p className="text-xs text-muted">Separados de las ventas y conservados para control.</p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-purple-800">{giftOrders.length}</span>
        </div>
        {giftOrders.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {giftOrders.map((order) => (
              <button key={order.id} type="button" onClick={() => setFilter('gift')} className="flex items-center justify-between rounded-xl border border-purple-200 bg-white px-3 py-2 text-left">
                <span className="font-black text-ink">{order.displayNumber}</span>
                <span className="truncate px-3 text-xs text-muted">{order.customerName || 'Cliente General'}</span>
                <span className="text-xs font-bold text-purple-800">{formatCurrency(order.total)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Panel>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === option.value ? 'bg-ink text-white shadow-card' : 'bg-white/70 text-muted hover:bg-white hover:text-ink'
              }`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm text-muted shadow-insetSoft lg:flex">
            <Filter size={14} className="text-accent" />
            Filtro activo: {filterOptions.find((option) => option.value === filter)?.label}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentWash text-accent">
            <ScrollText size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">Registro del periodo</h3>
            <p className="text-sm text-muted">{filteredOrders.length} pedidos visibles</p>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-line p-10 text-center text-muted font-semibold bg-white/50">
            No se encontraron pedidos para este filtro.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map((order) => {
              return (
                <div key={order.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm hover:shadow transition-all space-y-3.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-ink">{order.displayNumber}</span>
                    <span className="text-xs text-muted font-medium">
                      {formatTime(order.createdAt)}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <div>
                      <span className="font-bold text-muted">Cliente:</span>{' '}
                      <span className="font-semibold text-ink">{order.customerName || 'Cliente General'}</span>
                    </div>
                    {order.orderSource === 'whatsapp' && order.customerPhone ? (
                      <div>
                        <span className="font-bold text-muted">Telefono:</span>{' '}
                        <span className="font-semibold text-ink">{order.customerPhone}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <SourceBadge source={order.orderSource} />
                      <FulfillmentBadge type={order.fulfillmentType} tableInfo={order.tableInfo} source={order.orderSource} />
                      <PaymentBadge paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} qrProofReceived={order.qrProofReceived} />
                      <StatusPill status={order.status} />
                    </div>
                    <PaymentBreakdown payment={order.payment} paymentStatus={order.paymentStatus} />
                  </div>

                  <div className="border-t border-dashed border-line pt-2.5 text-xs text-ink/90 space-y-1 max-h-[120px] overflow-y-auto pr-1">
                    {/* El historial mostraba solo el nombre y el precio. Si en caja se le agregaba
                        un extra a un pedido, aca se veia el precio nuevo pero no QUE se agrego, y
                        no habia forma de revisar el pedido tal como quedo. Se muestra igual que en
                        Pedidos Finalizados para que las dos pantallas digan lo mismo. */}
                    {order.items.map((item) => (
                      <div key={item.id}>
                        <div className="flex justify-between">
                          <span>{item.quantity}x {item.name}</span>
                          <span className="text-muted font-semibold">{formatCurrency(item.lineTotal)}</span>
                        </div>
                        {item.modifiers?.extras?.length ? (
                          <div className="pl-3 text-[10px] font-semibold text-accent">
                            + Extras: {formatExtrasList(item.modifiers.extras)}
                          </div>
                        ) : null}
                        {item.modifiers?.options?.length ? (
                          <div className="pl-3 text-[10px] text-muted">
                            + Opciones: {item.modifiers.options.join(', ')}
                          </div>
                        ) : null}
                        {item.modifiers?.note ? (
                          <div className="pl-3 text-[10px] font-bold text-red-600">
                            Obs: {item.modifiers.note}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-line pt-2.5 flex justify-between items-center">
                    <span className="text-xs font-black text-ink">Total: {formatCurrency(getOrderSaleAmount(order))}</span>
                    <div className="flex gap-2">
                      {order.status !== 'cancelled' ? (
                        <>
                          {order.status !== 'delivered' ? (
                          <Button
                            size="sm"
                            tone="success"
                            className="px-2 py-1 h-7 text-[10px] font-black rounded-lg"
                            disabled={busyOrderId === order.id}
                            onClick={async () => {
                              setBusyOrderId(order.id)
                              await onAdvanceStatus(order.id, 'delivered')
                              setBusyOrderId(null)
                            }}
                          >
                            Entregar
                          </Button>
                          ) : null}

                          {(userRole === 'admin' || userRole === 'caja' || userRole === 'demo') ? (
                            <button
                              type="button"
                              disabled={busyOrderId === order.id}
                              onClick={() => void handleDeleteClick(order)}
                              className="flex h-7 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[10px] font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                              title="Mover a Pedidos eliminados"
                            >
                              <Trash2 size={11} />
                              Eliminar
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                          Eliminado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

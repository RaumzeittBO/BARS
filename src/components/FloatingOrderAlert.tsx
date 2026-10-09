import { CheckCircle2, ChevronDown, ChevronUp, Clock, MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency } from '../lib/format'
import { getOrderProductTotal } from '../lib/orderReports'
import { stopContinuousOrderAlert } from '../lib/sound'
import type { Order } from '../types'

export function FloatingOrderAlert({
  orders,
  onConfirmOrder,
}: {
  orders: Order[]
  onConfirmOrder: (orderId: string, estimatedDelay: number) => Promise<void>
}) {
  const [minimized, setMinimized] = useState(false)
  const [selectedDelay, setSelectedDelay] = useState(10)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  const pendingOrders = orders.filter(
    (order) => order.status === 'pending'
  )

  if (pendingOrders.length === 0) return null

  const currentOrder = pendingOrders[0]

  async function handleConfirm() {
    if (!currentOrder || busyOrderId) return
    stopContinuousOrderAlert()
    try {
      setBusyOrderId(currentOrder.id)
      await onConfirmOrder(currentOrder.id, selectedDelay)
    } finally {
      setBusyOrderId(null)
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md sm:w-[440px] transition-all duration-300">
      <div className="overflow-hidden rounded-2xl border-2 border-accent bg-white shadow-2xl shadow-black/30">
        {/* Cabecera Estilo Yango / PedidosYa */}
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-accent"></span>
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-accent">
              ¡NUEVO PEDIDO ({pendingOrders.length})!
            </span>
            <span className="font-mono text-xs font-bold text-white/80">
              {currentOrder.displayNumber || ''}
            </span>
          </div>

          <button
            type="button"
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white transition"
            onClick={() => setMinimized((m) => !m)}
            title={minimized ? 'Expandir detalle' : 'Minimizar'}
          >
            {minimized ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>

        {/* Cuerpo de la Notificación */}
        {!minimized && (
          <div className="p-4 space-y-3 bg-panel/40">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div>
                <p className="text-sm font-black text-ink">
                  {currentOrder.customerName || 'Cliente General'}
                </p>
                {currentOrder.customerPhone ? (
                  <p className="flex items-center gap-1 text-xs text-muted font-medium">
                    <Phone size={12} /> {currentOrder.customerPhone}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800 uppercase">
                  {currentOrder.qrProofReceived || (currentOrder.paymentStatus === 'paid' && currentOrder.paymentMethod === 'qr')
                    ? 'PAGADO CON QR'
                    : currentOrder.paymentStatus === 'paid'
                      ? 'PAGADO'
                      : 'POR COBRAR'}
                </span>
                <p className="mt-1 text-xs font-black text-accent">
                  Total: {formatCurrency(getOrderProductTotal(currentOrder))}
                </p>
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 pr-1 text-xs">
              {currentOrder.items.map((item, idx) => {
                const extras = item.modifiers?.extras?.length
                  ? ` + ${item.modifiers.extras.map((e) => e.name).join(', ')}`
                  : ''
                const note = item.modifiers?.note ? ` (${item.modifiers.note})` : ''
                return (
                  <div key={idx} className="flex justify-between items-start py-0.5 border-b border-dashed border-line/60 last:border-0">
                    <span className="font-semibold text-ink">
                      {item.quantity}x {item.name}{extras}{note}
                    </span>
                    <span className="font-mono text-muted shrink-0 ml-2">
                      Bs {item.lineTotal}
                    </span>
                  </div>
                )
              })}
            </div>

            {currentOrder.fulfillmentType === 'delivery' && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
                <p className="flex items-center gap-1 font-bold">
                  <MapPin size={13} className="text-amber-700 shrink-0" />
                  <span className="truncate">
                    {currentOrder.deliveryAddress ? (
                      currentOrder.deliveryAddress.startsWith('http') ? (
                        <a href={currentOrder.deliveryAddress} target="_blank" rel="noopener noreferrer" className="underline font-bold text-accent">
                          Ver Ubicación GPS en Mapa
                        </a>
                      ) : (
                        currentOrder.deliveryAddress
                      )
                    ) : (
                      'Envío a domicilio (Ubicación pendiente)'
                    )}
                  </span>
                </p>
              </div>
            )}

            <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-line">
              <span className="text-[11px] font-black text-muted uppercase flex items-center gap-1">
                <Clock size={13} /> Tiempo Aprox:
              </span>
              <div className="flex gap-1">
                {[5, 10, 15, 20, 25, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`px-2 py-1 rounded-lg text-xs font-black transition ${
                      selectedDelay === mins
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-panel hover:bg-line text-ink'
                    }`}
                    onClick={() => setSelectedDelay(mins)}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                disabled={Boolean(busyOrderId)}
                onClick={handleConfirm}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3 px-4 text-xs font-black tracking-wider uppercase shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                <span>CONFIRMAR PEDIDO ({selectedDelay} MIN)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import type { FulfillmentType, OrderSource } from '../types'

export const currency = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  minimumFractionDigits: 0,
})

export const time = new Intl.DateTimeFormat('es-BO', {
  hour: '2-digit',
  minute: '2-digit',
})

export const dateTime = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatCurrency(value: number) {
  return currency.format(value)
}

export function formatTime(isoDate: string) {
  return time.format(new Date(isoDate))
}

export function formatDateTime(isoDate?: string) {
  return isoDate ? dateTime.format(new Date(isoDate)) : '-'
}

export function formatElapsed(fromIsoDate: string, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(fromIsoDate).getTime()) / 1000))
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatPaymentMethod(method: 'cash' | 'qr' | 'mixed') {
  if (method === 'cash') {
    return 'Efectivo'
  }

  if (method === 'qr') {
    return 'QR'
  }

  return 'Mixto'
}

export function formatOrderSource(source: OrderSource) {
  return source === 'whatsapp' ? 'WhatsApp' : 'Local'
}

export function formatFulfillmentType(type: FulfillmentType) {
  if (type === 'table') return 'Mesa'
  if (type === 'pickup') return 'Retiro'
  return 'Delivery'
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF', content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Extras de un producto en una linea, agrupando los repetidos: "Tocino (x2), Piña".
 *
 * Vive aca y no dentro de una pantalla porque lo usan Caja e Historial, y las dos tienen que
 * mostrar el pedido exactamente igual. Cuando estaba duplicado, el historial se quedo sin
 * mostrarlos y un extra agregado en una edicion no aparecia por ningun lado.
 */
export function formatExtrasList(extras: Array<{ name?: string }> | undefined) {
  if (!extras || extras.length === 0) return ''
  const cuenta = new Map<string, number>()
  extras.forEach((extra) => {
    if (extra?.name) cuenta.set(extra.name, (cuenta.get(extra.name) || 0) + 1)
  })
  return Array.from(cuenta.entries())
    .map(([nombre, veces]) => (veces > 1 ? `${nombre} (x${veces})` : nombre))
    .join(', ')
}

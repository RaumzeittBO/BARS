/**
 * Reparto de un pago por QR entre varias cuentas.
 *
 * A veces pagan entre varias personas desde cuentas distintas. El monto total que entra por QR no
 * cambia: lo unico que se agrega es el detalle de cuanto puso cada cuenta. Por eso el desglose se
 * guarda AL LADO de `qrAmount` y nunca en su lugar; el cierre de caja y los reportes siguen
 * sumando `qrAmount` sin enterarse de nada.
 */

export const MIN_CUENTAS_QR = 2
export const MAX_CUENTAS_QR = 6

/** Tolerancia al comparar dinero, para que los centavos no bloqueen el cobro por un redondeo. */
const TOLERANCIA = 0.005

export function montoDesdeTexto(texto: string) {
  const numero = Number(String(texto).replace(',', '.'))
  return Number.isFinite(numero) && numero > 0 ? numero : 0
}

export function montosDesdeTextos(textos: string[]) {
  return textos.map(montoDesdeTexto)
}

export function sumarMontos(montos: number[]) {
  return montos.reduce((suma, monto) => suma + monto, 0)
}

/** Cuanto falta (positivo) o cuanto sobra (negativo) para llegar al total del QR. */
export function diferenciaConTotal(montos: number[], total: number) {
  return Number((total - sumarMontos(montos)).toFixed(2))
}

/**
 * Un reparto vale solo si TODAS las cuentas tienen monto y la suma da exacto. Dejar guardar un
 * pago descuadrado ensuciaria el cierre de caja despues, cuando ya nadie se acuerda del pedido.
 */
export function repartoCuadra(montos: number[], total: number) {
  if (montos.length < MIN_CUENTAS_QR) return false
  if (montos.some((monto) => monto <= 0)) return false
  return Math.abs(diferenciaConTotal(montos, total)) < TOLERANCIA
}

/** Ajusta la cantidad de cuentas conservando los montos ya escritos. */
export function cambiarCantidadDeCuentas(textos: string[], cantidad: number) {
  const objetivo = Math.min(MAX_CUENTAS_QR, Math.max(MIN_CUENTAS_QR, Math.round(cantidad)))
  if (objetivo === textos.length) return textos
  if (objetivo < textos.length) return textos.slice(0, objetivo)
  return [...textos, ...Array(objetivo - textos.length).fill('')]
}

/**
 * El desglose que se guarda con el pedido. Devuelve `null` cuando no corresponde guardarlo, y
 * quien llama debe entonces OMITIR la clave: Firestore rechaza un `undefined` con un error que no
 * dice nada util, y las reglas solo aceptan la lista cuando viene bien formada.
 */
export function desgloseParaGuardar(activo: boolean, montos: number[], total: number) {
  if (!activo) return null
  if (!repartoCuadra(montos, total)) return null
  return montos.map((monto) => Number(monto.toFixed(2)))
}

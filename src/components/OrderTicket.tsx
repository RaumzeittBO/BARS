import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../lib/format'
import type { Order } from '../types'
import { enviarARawBt, formatEstimatedDeliveryTime, formatTicketDateTime, modoImpresion, mostrarTelefonoEnTicket, ticketClienteBase64, ticketCocinaBase64, ticketsCajaBase64 } from '../lib/escpos'

/**
 * Ticket termico compartido por Caja y Cocina.
 *
 * Caja puede pedir cliente + cocina en una sola carga de RawBT, mientras que las reimpresiones
 * y la tablet de cocina pueden solicitar una sola copia. Los tres caminos comparten el mismo
 * formato para que no se desincronicen con el tiempo.
 *
 * Medida: papel de 80 mm, con 76 mm de contenido util (2 mm de margen a cada lado).
 */

function formatExtrasList(extras: Array<{ name: string }> | undefined) {
  if (!extras || extras.length === 0) return ''
  const counts = new Map<string, number>()
  extras.forEach((extra) => {
    counts.set(extra.name, (counts.get(extra.name) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
    .join(', ')
}

function describeFulfillment(order: Order) {
  if (order.fulfillmentType === 'table') return 'Mesa'
  if (order.fulfillmentType === 'pickup') return order.orderSource === 'whatsapp' ? 'Recojo' : 'Para llevar'
  return 'Delivery'
}

function TicketHeaderData({ order, showFulfillment = true }: { order: Order; showFulfillment?: boolean }) {
  return (
    <div className="flex w-full items-stretch justify-between gap-2 border-t border-b border-black border-dashed py-1 text-left text-[9px]">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-[8px]"><b>Fecha/Hora:</b> {formatTicketDateTime(order.createdAt)}</div>
        <div><b>Cliente:</b> {order.customerName || 'Cliente General'}</div>
        {showFulfillment && order.orderSource !== 'whatsapp' ? <div><b>Entrega:</b> {describeFulfillment(order)}</div> : null}
        {/* Mismo criterio que el ticket de RawBT: el telefono sale en delivery, no en los pedidos
            de WhatsApp mientras el bot este pausado, y nunca el relleno "Sin telefono". */}
        {mostrarTelefonoEnTicket(order) ? <div><b>Telefono:</b> {order.customerPhone}</div> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center font-black leading-none">
        <span className="text-[9px]">TOTAL</span>
        <span className="mt-1 text-[22px]">{formatCurrency(order.total)}</span>
      </div>
    </div>
  )
}

function SimpleCustomerTicket({ order }: { order: Order }) {
  return (
    <div className="print-page w-full flex flex-col items-center text-center">
      <div className="w-full border-b border-black border-dashed pb-0.5 text-3xl font-black leading-none">
        {order.displayNumber}
      </div>
      <div className="w-full border-b border-black border-dashed py-0.5 text-[9px] font-semibold whitespace-nowrap">
        Fecha/Hora: {formatTicketDateTime(order.createdAt)}
      </div>
    </div>
  )
}

function TicketOrderHeading({ title, number, rightDetail }: { title: string; number: string; rightDetail?: string }) {
  return (
    <div className="relative mb-2 flex min-h-7 w-full items-center">
      <span className="absolute left-0 max-w-[40%] whitespace-nowrap text-sm font-black leading-none">{title}</span>
      <span className="mx-auto text-xl font-bold tracking-wider">{number}</span>
      {rightDetail ? <span className="absolute right-0 text-sm font-black leading-none">{rightDetail}</span> : null}
    </div>
  )
}

/** WhatsApp conserva su unica copia detallada porque tambien funciona como comanda operativa. */
function DetailedWhatsappTicket({ order }: { order: Order }) {
  const title = order.fulfillmentType === 'delivery' ? 'DELIVERY' : 'RECOJO'
  const titleWithTime = `${title}, ${formatEstimatedDeliveryTime(order)}`

  return (
    <div className="print-page w-full flex flex-col items-center">
      <TicketOrderHeading title={titleWithTime} number={order.displayNumber} />

      <TicketHeaderData order={order} />

      <div className="mt-2 w-full space-y-1.5 text-[9px]">
        {order.items.map((item, idx) => (
          <div key={idx} className="w-full">
            <div className={`flex justify-between font-bold ${order.orderSource === 'whatsapp' ? 'text-xs' : ''}`}>
              <span>{item.quantity}x {item.name}</span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </div>
            {item.modifiers.extras.length > 0 && (
              <div className="text-[10px] font-bold leading-tight">
                + {formatExtrasList(item.modifiers.extras)}
              </div>
            )}
            {item.modifiers.options.length > 0 && (
              <div className="text-[10px] font-bold leading-tight">
                + {item.modifiers.options.join(', ')}
              </div>
            )}
            {item.modifiers.note && (
              <div className="text-[8px] text-red-700 font-bold ml-2">
                Obs: {item.modifiers.note}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-black border-dashed mt-2 pt-1 w-full text-right text-[9px] space-y-0.5">
        {order.paymentStatus === 'paid' ? (
          <div className="flex justify-between">
            <span>Metodo:</span>
            <span>{order.payment?.method === 'qr' ? 'Pago QR' : order.payment?.method === 'mixed' ? 'Mixto' : 'Efectivo'}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>Estado:</span>
          <span>{order.paymentStatus === 'paid' ? 'PAGADO' : 'PENDIENTE'}</span>
        </div>
      </div>

    </div>
  )
}

/** La primera copia local es compacta; WhatsApp mantiene todos sus datos. */
function CustomerTicket({ order }: { order: Order }) {
  return order.orderSource === 'whatsapp'
    ? <DetailedWhatsappTicket order={order} />
    : <SimpleCustomerTicket order={order} />
}

/** El de preparacion: sin precios, con los extras y observaciones bien grandes. */
function KitchenTicket({ order }: { order: Order }) {
  const title = order.orderSource === 'whatsapp'
    ? order.fulfillmentType === 'delivery' ? 'DELIVERY' : 'RECOJO'
    : order.fulfillmentType === 'table'
      ? 'MESA'
      : order.fulfillmentType === 'pickup' ? 'PARA LLEVAR' : 'DELIVERY'

  return (
    <div className="print-page w-full flex flex-col items-center">
      <TicketOrderHeading
        title={order.orderSource === 'whatsapp' ? `${title}, ${formatEstimatedDeliveryTime(order)}` : title}
        number={order.displayNumber}
      />

      <TicketHeaderData order={order} showFulfillment={false} />

      <div className="mt-2 w-full space-y-2 text-[10px]">
        {order.items.map((item, idx) => (
          <div key={idx} className="w-full border-b border-black/10 pb-1">
            <div className="flex items-start justify-between gap-2 font-bold text-xs">
              <span>{item.quantity}x {item.name}</span>
              <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
            </div>
            {item.modifiers.extras.length > 0 && (
              <div className="text-[10px] font-bold leading-tight">
                + {formatExtrasList(item.modifiers.extras)}
              </div>
            )}
            {item.modifiers.options.length > 0 && (
              <div className="text-[10px] font-bold leading-tight">
                + {item.modifiers.options.join(', ')}
              </div>
            )}
            {item.modifiers.note && (
              <div className="text-[9px] text-red-600 font-bold ml-2 border border-red-200 bg-red-50 p-1 mt-0.5 rounded">
                OBS: {item.modifiers.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Monta el ticket y dispara la impresion. Se limpia solo cuando termina.
 *
 * OJO: el navegador SIEMPRE abre su dialogo de impresion; no existe forma de imprimir en
 * silencio desde una pagina web. Lo que se automatiza aca es que el dialogo se abra solo,
 * sin que nadie apriete nada. Para imprimir de verdad sin ningun dialogo hay que hablarle a
 * la impresora bluetooth directamente (ESC/POS), que es un trabajo aparte.
 */
export function PrintableTicket({
  order,
  variant,
  onDone,
}: {
  order: Order | null
  variant: 'customer' | 'kitchen' | 'cashier'
  onDone: () => void
}) {
  const ticket = useRef<HTMLDivElement>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!order) return

    // Camino preferido en las tablets: mandar el ticket como comandos a RawBT. Asi corta el
    // papel solo, no aparece ningun dialogo y el formato lo controla el sistema. La impresion
    // del navegador manda una imagen, y por eso no puede cortar.
    if (modoImpresion() === 'rawbt') {
      const datos = variant === 'cashier'
        ? ticketsCajaBase64(order)
        : variant === 'customer'
          ? ticketClienteBase64(order)
          : ticketCocinaBase64(order)
      enviarARawBt(datos)
      // Se libera enseguida: RawBT se encarga desde aca y la app no tiene nada que esperar.
      const listo = window.setTimeout(() => onDoneRef.current(), 1200)
      return () => window.clearTimeout(listo)
    }

    // Respaldo (PC, o si se elige a mano): impresion del navegador.
    //
    // Chrome de Android ignora las reglas de "@media print", asi que no se le pide nada:
    // se esconde #root y se muestra el ticket con estilo EN LINEA, que es un cambio real del
    // documento. En ese instante la pagina contiene unicamente el ticket.
    //
    // Lo que fallo antes y hay que evitar:
    //   - visibility: hidden           -> hojas en blanco
    //   - imprimir dentro de un iframe -> imprimia la pagina entera
    //   - display:none por CSS print   -> imprimia la pagina entera
    //   - restaurar al recuperar el foco -> en Android el foco vuelve APENAS se llama a
    //     imprimir, asi que la app reaparecia antes de que el sistema tomara la imagen.
    const raiz = document.getElementById('root')
    const displayRaiz = raiz?.style.display ?? ''
    let restaurado = false

    const restaurar = () => {
      if (restaurado) return
      restaurado = true
      if (raiz) raiz.style.display = displayRaiz
      if (ticket.current) ticket.current.style.display = 'none'
      window.removeEventListener('afterprint', intentarRestaurar)
      window.removeEventListener('focus', intentarRestaurar)
      document.removeEventListener('visibilitychange', alVolverAVer)
      document.removeEventListener('pointerdown', intentarRestaurar, true)
      onDoneRef.current()
    }

    // Cuando termina la impresion NO se puede saber por tiempo: en Android el usuario abre la
    // previsualizacion, la mira unos segundos y recien ahi imprime. Si la app se restaura antes,
    // la previsualizacion sale bien (se genero al principio) pero el papel sale con la pantalla
    // del sistema. Tampoco alcanza con la visibilidad de la pagina: en algunos Android el
    // dialogo no la marca como oculta, y entonces nunca se restaura y la pantalla queda trabada
    // mostrando el ticket. Las dos cosas pasaron.
    //
    // La señal que si es confiable: el usuario TOCA la pantalla al volver. Mientras esta en el
    // dialogo de impresion no puede tocar nuestra pagina, asi que ese toque solo puede ocurrir
    // cuando ya volvio. Se escucha eso, mas la visibilidad y "afterprint" por si alguno llega
    // primero, con una guarda inicial para descartar los avisos falsos que dispara el propio
    // print() en Android.
    const GUARDA_MS = 1200
    let momentoImpresion = 0

    const puedeRestaurar = () => momentoImpresion > 0 && Date.now() - momentoImpresion > GUARDA_MS

    const intentarRestaurar = () => {
      if (puedeRestaurar()) restaurar()
    }

    const alVolverAVer = () => {
      if (document.visibilityState === 'visible') intentarRestaurar()
    }

    document.addEventListener('visibilitychange', alVolverAVer)
    document.addEventListener('pointerdown', intentarRestaurar, true)
    window.addEventListener('afterprint', intentarRestaurar)
    window.addEventListener('focus', intentarRestaurar)

    const imprimir = window.setTimeout(() => {
      if (raiz) raiz.style.display = 'none'
      if (ticket.current) ticket.current.style.display = 'block'
      momentoImpresion = Date.now()
      window.print()
    }, 300)

    // Respaldo largo, solo para que la app no quede oculta si el usuario nunca vuelve. No debe
    // dispararse mientras esta mirando la previsualizacion.
    const respaldo = window.setTimeout(restaurar, 180000)

    return () => {
      window.clearTimeout(imprimir)
      window.clearTimeout(respaldo)
      if (raiz) raiz.style.display = displayRaiz
      if (ticket.current) ticket.current.style.display = 'none'
      window.removeEventListener('afterprint', intentarRestaurar)
      window.removeEventListener('focus', intentarRestaurar)
      document.removeEventListener('visibilitychange', alVolverAVer)
      document.removeEventListener('pointerdown', intentarRestaurar, true)
    }
  }, [order, variant])

  if (!order) return null

  // Ancho 70 mm y no 76: en papel de 80 mm el area imprimible real es menor, y los valores
  // alineados a la derecha (BOB 22, Efectivo, PAGADO) salian cortados en la impresion.
  return createPortal(
    <div
      ref={ticket}
      id="print-ticket"
      className="text-black font-mono text-[10px] leading-normal"
      style={{ display: 'none', width: '70mm', padding: '0 1mm', margin: '0', background: '#fff', color: '#000' }}
    >
      <style>{'@page { size: 80mm auto; margin: 0; } #print-ticket * { max-width: 100%; }'}</style>
      {variant === 'cashier' ? (
        order.orderSource === 'whatsapp' ? <CustomerTicket order={order} /> : (
          <>
            <div style={{ breakAfter: 'page', pageBreakAfter: 'always' }}><CustomerTicket order={order} /></div>
            <KitchenTicket order={order} />
          </>
        )
      ) : variant === 'customer' ? <CustomerTicket order={order} /> : <KitchenTicket order={order} />}
    </div>,
    document.body,
  )
}

import type { Order } from '../types'
import { BOT_WHATSAPP_ACTIVO } from './featureFlags'

/**
 * Ticket como comandos ESC/POS, enviado a RawBT.
 *
 * Imprimir la pagina desde el navegador manda una IMAGEN a la impresora, y por eso no se puede
 * cortar el papel: el corte no es parte de la imagen, es un comando. Aca se arma el ticket como
 * comandos de impresora (igual que hace Loyverse) y se le pasa a RawBT directamente. Con eso
 * salen las tres cosas que faltaban: corte automatico, impresion sin dialogo y control del
 * formato desde el codigo.
 *
 * Formato del enlace, tomado de la libreria escpos-php (mike42):
 *   intent:base64,<datos>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
 */

/** Papel de 80 mm: 48 caracteres por linea en la tipografia normal. */
export const ANCHO_TICKET = 48

/**
 * Lineas en blanco arriba del ticket de cocina cuando sale pegado al del cliente.
 *
 * Cada linea son unos 3,75 mm, asi que tres dan poco mas de un centimetro: parecido al margen con
 * el que ya salia el primer ticket. Subir o bajar este numero es lo unico que hay que tocar si el
 * espacio queda corto o largo; no afecta al corte ni a ningun otro ticket.
 */
const LINEAS_MARGEN_COCINA = 3
const ANCHO_TICKET_COMPACTO = 64

const ESC = 0x1b
const GS = 0x1d

/**
 * Las impresoras no entienden UTF-8: usan tablas de un byte. Se elige CP850, que tiene las
 * vocales acentuadas y la ñ (importante: hay productos como "Piña"). Sin esto salen simbolos
 * raros en vez de las tildes.
 */
const CP850: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6,
}

function codificar(texto: string): number[] {
  const bytes: number[] = []
  for (const caracter of texto) {
    const mapeado = CP850[caracter]
    if (mapeado !== undefined) {
      bytes.push(mapeado)
      continue
    }
    const codigo = caracter.charCodeAt(0)
    // Cualquier cosa fuera de la tabla se reemplaza por un espacio en vez de imprimir basura.
    bytes.push(codigo < 128 ? codigo : 0x20)
  }
  return bytes
}

class Ticket {
  private bytes: number[] = []

  iniciar() {
    this.bytes.push(ESC, 0x40) // ESC @ : reinicia la impresora
    this.bytes.push(ESC, 0x74, 0x02) // ESC t 2 : tabla de caracteres CP850
    return this
  }

  alinear(donde: 'izquierda' | 'centro' | 'derecha') {
    const valor = donde === 'centro' ? 1 : donde === 'derecha' ? 2 : 0
    this.bytes.push(ESC, 0x61, valor)
    return this
  }

  negrita(activar: boolean) {
    this.bytes.push(ESC, 0x45, activar ? 1 : 0)
    return this
  }

  fuenteCompacta(activar: boolean) {
    this.bytes.push(ESC, 0x4d, activar ? 1 : 0)
    return this
  }

  /** Separacion horizontal adicional entre caracteres, expresada en puntos de impresora. */
  espaciadoCaracteres(puntos = 0) {
    this.bytes.push(ESC, 0x20, Math.min(255, Math.max(0, puntos)))
    return this
  }

  tamano(ancho = 1, alto = 1) {
    const anchoSeguro = Math.min(8, Math.max(1, ancho)) - 1
    const altoSeguro = Math.min(8, Math.max(1, alto)) - 1
    this.bytes.push(GS, 0x21, (altoSeguro << 4) | anchoSeguro)
    return this
  }

  /** Letra al doble de alto y ancho, para numeros y productos importantes. */
  doble(activar: boolean) {
    return this.tamano(activar ? 2 : 1, activar ? 2 : 1)
  }

  linea(texto = '') {
    this.bytes.push(...codificar(texto), 0x0a)
    return this
  }

  texto(texto: string) {
    this.bytes.push(...codificar(texto))
    return this
  }

  separador(caracter = '-') {
    return this.linea(caracter.repeat(ANCHO_TICKET))
  }

  /** Texto a la izquierda y valor a la derecha, rellenando el medio con espacios. */
  filaDoble(izquierda: string, derecha: string, ancho = ANCHO_TICKET) {
    const espacio = ancho - derecha.length
    const recortada = izquierda.length > espacio ? izquierda.slice(0, Math.max(0, espacio - 1)) : izquierda
    const relleno = ' '.repeat(Math.max(1, ancho - recortada.length - derecha.length))
    return this.linea(`${recortada}${relleno}${derecha}`)
  }

  /** Combina texto normal a la izquierda con un valor ampliado y alineado a la derecha. */
  filaConValorGrande(izquierda: string, derecha: string, alto = 1) {
    const anchoDerecha = derecha.length * 2
    const espacioIzquierda = Math.max(0, ANCHO_TICKET - anchoDerecha - 1)
    const recortada = izquierda.slice(0, espacioIzquierda)
    const relleno = ' '.repeat(Math.max(1, ANCHO_TICKET - recortada.length - anchoDerecha))

    this.texto(`${recortada}${relleno}`)
    this.tamano(2, alto).negrita(true).linea(derecha)
    this.negrita(false).tamano()
    return this
  }

  /** Modalidad a la izquierda y numero grande centrado, ambos en la misma franja. */
  filaTituloNumero(titulo: string, numero: string, detalleDerecha = '') {
    const anchoNumero = numero.length * 2
    const inicioNumero = Math.max(0, Math.floor((ANCHO_TICKET - anchoNumero) / 2))
    const tituloRecortado = titulo.slice(0, Math.max(0, inicioNumero - 1))
    const relleno = ' '.repeat(Math.max(1, inicioNumero - tituloRecortado.length))

    this.tamano(1, 2).negrita(true).texto(`${tituloRecortado}${relleno}`)
    this.tamano(2, 2).texto(numero)
    if (detalleDerecha) {
      const columnasUsadas = inicioNumero + anchoNumero
      const detalle = detalleDerecha.slice(0, Math.max(0, ANCHO_TICKET - columnasUsadas - 1))
      const rellenoDerecho = ' '.repeat(Math.max(1, ANCHO_TICKET - columnasUsadas - detalle.length))
      this.tamano(1, 2).linea(`${rellenoDerecho}${detalle}`)
    } else {
      this.linea()
    }
    this.negrita(false).tamano()
    return this
  }

  /** Parte un texto largo en varias lineas sin cortar palabras al medio. */
  parrafo(texto: string, sangria = 0, ancho = ANCHO_TICKET) {
    const disponible = ancho - sangria
    const palabras = texto.split(/\s+/).filter(Boolean)
    let actual = ''
    for (const palabra of palabras) {
      if (actual && (actual + ' ' + palabra).length > disponible) {
        this.linea(' '.repeat(sangria) + actual)
        actual = palabra
      } else {
        actual = actual ? `${actual} ${palabra}` : palabra
      }
    }
    if (actual) this.linea(' '.repeat(sangria) + actual)
    return this
  }

  avanzar(lineas = 1) {
    this.bytes.push(ESC, 0x64, lineas)
    return this
  }

  /** Corte parcial compatible con la impresora termica del local. */
  cortar() {
    this.bytes.push(GS, 0x56, 0x42, 0x00)
    return this
  }

  aBase64() {
    const datos = new Uint8Array(this.bytes)
    let binario = ''
    const bloque = 0x8000
    for (let i = 0; i < datos.length; i += bloque) {
      binario += String.fromCharCode(...datos.subarray(i, i + bloque))
    }
    return btoa(binario)
  }
}

function precio(valor: number) {
  return `Bs ${valor}`
}

/**
 * El telefono solo se imprime cuando aporta algo.
 *
 * El numero de los pedidos de WhatsApp NO va al ticket mientras el bot este pausado: es el
 * contacto que usaba el bot para avisar, no un dato que cocina o la moto necesiten leer. Se
 * decide por el origen del pedido y no por la modalidad, porque un delivery de WhatsApp tambien
 * tiene que salir sin numero.
 *
 * En los pedidos locales si se imprime: ahi el telefono se pide justamente para ubicar al cliente
 * cuando el pedido sale a domicilio.
 *
 * Se descarta ademas el relleno "Sin telefono". Ese texto existe porque Firestore exige un valor
 * no vacio para poder guardar el pedido, pero imprimirlo gasta una linea entera para decir que no
 * hay telefono, que es justo lo que se entiende sin la linea.
 */
export function mostrarTelefonoEnTicket(order: Order) {
  const telefono = (order.customerPhone || '').trim()
  if (!telefono || telefono.toLowerCase() === 'sin telefono') return false
  if (order.orderSource === 'whatsapp') return BOT_WHATSAPP_ACTIVO
  return true
}

function describirEntrega(order: Order) {
  if (order.fulfillmentType === 'table') return 'Mesa'
  if (order.fulfillmentType === 'pickup') return order.orderSource === 'whatsapp' ? 'Recojo' : 'Para llevar'
  return 'Delivery'
}

function tituloWhatsapp(order: Order) {
  if (order.orderSource !== 'whatsapp') return undefined
  return order.fulfillmentType === 'delivery' ? 'DELIVERY' : 'RECOJO'
}

function tituloCocina(order: Order) {
  if (order.orderSource === 'whatsapp') return tituloWhatsapp(order)
  if (order.fulfillmentType === 'table') return 'MESA'
  if (order.fulfillmentType === 'pickup') return 'PARA LLEVAR'
  return 'DELIVERY'
}

export function formatEstimatedDeliveryTime(order: Pick<Order, 'createdAt' | 'estimatedDelay'>) {
  const createdAt = new Date(order.createdAt)
  if (Number.isNaN(createdAt.getTime())) return '--:--'

  const delay = Number.isFinite(order.estimatedDelay) ? Number(order.estimatedDelay) : 10
  const deliveryAt = new Date(createdAt.getTime() + delay * 60_000)
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/La_Paz',
  }).format(deliveryAt)
}

export function formatTicketDateTime(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '--/--/---- --:--:--'

  const parts = new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/La_Paz',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '--'

  return `${value('day')}/${value('month')}/${value('year')} ${value('hour')}:${value('minute')}:${value('second')}`
}

/** Nombres de los extras, uno por elemento. Los repetidos se agrupan como "Tocino (x2)". */
function listarExtras(extras: Array<{ name: string }>) {
  const cuenta = new Map<string, number>()
  extras.forEach((extra) => cuenta.set(extra.name, (cuenta.get(extra.name) ?? 0) + 1))
  return Array.from(cuenta.entries())
    .map(([nombre, veces]) => (veces > 1 ? `${nombre} (x${veces})` : nombre))
}

/** Extras, opciones y observaciones: ampliados, con una sangria corta y sin alterar los cortes. */
function modificadorDestacado(t: Ticket, texto: string) {
  // Los extras salian en tamano normal y no se leian de un vistazo en cocina. Ahora van con la
  // MISMA ALTURA que el producto pero con el ancho normal: la impresora solo admite multiplos
  // enteros (no existe un 70% exacto), y esta combinacion es la que mas se acerca sin igualar al
  // producto, que tiene que seguir siendo lo primero que se ve.
  // Se quita el espaciado entre caracteres: servia para destacarlos cuando eran chicos, y ahora
  // solo hace que ocupen mas de lo necesario.
  t.negrita(true).tamano(1, 2).parrafo(texto, 3, 44)
  t.tamano().negrita(false)
}

/**
 * Un modificador POR FILA, cada uno con su propio "+".
 *
 * Antes iban todos juntos separados por comas en un solo parrafo, y en el papel se leia
 * "+ Sin cebolla, Sin sa / lsa, Sin queso": el corte de linea caia en medio de la lista y en
 * cocina habia que detenerse a descifrarlo. Uno por fila se lee de un vistazo, que es lo unico
 * que importa cuando estan armando el pedido.
 */
function modificadoresEnFilas(t: Ticket, textos: string[]) {
  textos.forEach((texto) => modificadorDestacado(t, `+ ${texto}`))
}

function encabezado(t: Ticket, order: Order, titulo?: string, mostrarEntrega = true) {
  t.alinear('izquierda')
  if (titulo) {
    const horaEntrega = order.orderSource === 'whatsapp' ? formatEstimatedDeliveryTime(order) : ''
    const tituloConHora = horaEntrega ? `${titulo}, ${horaEntrega}` : titulo
    t.filaTituloNumero(tituloConHora, order.displayNumber)
  } else {
    t.alinear('centro').doble(true).negrita(true).linea(order.displayNumber).negrita(false).doble(false).alinear('izquierda')
  }
  t.separador()
  t.fuenteCompacta(true).negrita(true)
    .filaDoble(`Fecha/Hora: ${formatTicketDateTime(order.createdAt)}`, 'TOTAL', ANCHO_TICKET_COMPACTO)
    .negrita(false).fuenteCompacta(false)
  t.filaConValorGrande(`Cliente: ${order.customerName || 'Cliente General'}`, precio(order.total), 2)
  if (mostrarEntrega && order.orderSource !== 'whatsapp') t.linea(`Entrega: ${describirEntrega(order)}`)
  if (mostrarTelefonoEnTicket(order)) t.linea(`Telefono: ${order.customerPhone}`)
  t.separador()
}

function contenidoCliente(t: Ticket, order: Order) {
  encabezado(t, order, tituloWhatsapp(order))

  order.items.forEach((item) => {
    if (order.orderSource === 'whatsapp') {
      t.doble(true).negrita(true).parrafo(`${item.quantity}x ${item.name}`, 0, ANCHO_TICKET / 2).negrita(false).doble(false)
    } else {
      t.filaDoble(`${item.quantity}x ${item.name}`, precio(item.lineTotal))
    }
    if (item.modifiers.extras.length) modificadoresEnFilas(t, listarExtras(item.modifiers.extras))
    if (item.modifiers.options.length) modificadoresEnFilas(t, item.modifiers.options)
    // La observacion va al mismo tamano que los extras: es igual de importante para quien arma el
    // pedido y en letra chica se perdia justo debajo de ellos.
    if (item.modifiers.note) modificadorDestacado(t, `Obs: ${item.modifiers.note}`)
    if (order.orderSource === 'whatsapp') {
      t.alinear('derecha').negrita(true).linea(precio(item.lineTotal)).negrita(false).alinear('izquierda')
    }
  })

  t.separador()

  // El "PENDIENTE DE PAGO" ya no se imprime: este ticket viaja pegado a la comida y ese renglon
  // no le aporta nada al cliente. Lo contrario si se mantiene: que el pedido esta PAGADO o que es
  // REGALO es justo lo que necesita ver la moto para saber que no tiene que cobrar. Y si no hay
  // nada que decir, tampoco se imprime el bloque, para no dejar dos lineas de guiones vacias.
  if (order.paymentStatus === 'paid') {
    t.linea(`Pago:   ${order.payment?.method === 'qr' ? 'QR' : order.payment?.method === 'mixed' ? 'Mixto' : 'Efectivo'}`)
    t.linea('Estado: PAGADO')
    t.separador()
  } else if (order.paymentStatus === 'gift') {
    t.linea('Estado: REGALO')
    t.separador()
  }
}

function contenidoClienteSimple(t: Ticket, order: Order) {
  t.alinear('centro')
  t.tamano(3, 3).negrita(true).linea(order.displayNumber).negrita(false).tamano()
  t.separador()
  t.fuenteCompacta(true).negrita(true).linea(`Fecha/Hora: ${formatTicketDateTime(order.createdAt)}`).negrita(false).fuenteCompacta(false)
  t.separador()
}

function contenidoCocina(t: Ticket, order: Order) {
  encabezado(t, order, tituloCocina(order), false)

  order.items.forEach((item) => {
    t.doble(true).negrita(true).parrafo(`${item.quantity}x ${item.name}`, 0, ANCHO_TICKET / 2).negrita(false).doble(false)
    if (item.modifiers.extras.length) modificadoresEnFilas(t, listarExtras(item.modifiers.extras))
    if (item.modifiers.options.length) modificadoresEnFilas(t, item.modifiers.options)
    if (item.modifiers.note) modificadorDestacado(t, `** ${item.modifiers.note.toUpperCase()} **`)
    t.alinear('derecha').negrita(true).linea(precio(item.lineTotal)).negrita(false).alinear('izquierda')
  })

  t.separador()
}

/** El cliente local recibe un comprobante compacto; WhatsApp conserva su ticket operativo. */
export function ticketClienteBase64(order: Order) {
  const t = new Ticket().iniciar()
  if (order.orderSource === 'whatsapp') contenidoCliente(t, order)
  else contenidoClienteSimple(t, order)
  t.cortar()

  return t.aBase64()
}

/** El de cocina: productos y precios grandes, con extras y observaciones bien visibles. */
export function ticketCocinaBase64(order: Order) {
  const t = new Ticket().iniciar()
  contenidoCocina(t, order)
  t.cortar()

  return t.aBase64()
}

/** Caja imprime una copia para WhatsApp y cliente + cocina para pedidos locales. */
export function ticketsCajaBase64(order: Order) {
  const t = new Ticket().iniciar()
  if (order.orderSource === 'whatsapp') contenidoCliente(t, order)
  else contenidoClienteSimple(t, order)
  t.cortar()

  if (order.orderSource === 'whatsapp') return t.aBase64()

  // Reiniciar despues del primer corte deja alineacion y tamano en un estado conocido para cocina.
  t.iniciar()
  // Margen blanco arriba del ticket de cocina.
  //
  // El primer ticket de cada impresion sale con un margen que el segundo no tenia: ese espacio se
  // agrega una sola vez al arrancar el trabajo, no en cada corte (si viniera del corte lo tendrian
  // los dos, porque los dos se cortan). Aca se pide explicitamente, que es lo unico que hace
  // falta: son lineas en blanco (ESC d), no toca el corte ni la forma en que se manda a RawBT.
  t.avanzar(LINEAS_MARGEN_COCINA)
  contenidoCocina(t, order)
  t.cortar()

  return t.aBase64()
}

/**
 * Manda el ticket a RawBT. Devuelve false si el navegador no pudo abrir la app, para que quien
 * llame pueda caer a la impresion normal del navegador.
 */
export function enviarARawBt(base64: string) {
  try {
    // El base64 va TAL CUAL, sin codificar. Se probo codificandolo (por miedo a que el "+" se
    // leyera como espacio) y RawBT respondio "Wrong base64": la direccion de un intent no se
    // interpreta como formulario, asi que el "+" viaja bien y codificarlo es justamente lo que
    // rompe los datos. Es la misma forma que usa la libreria escpos-php.
    const enlace = `intent:base64,${base64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`

    // Se dispara desde un marco oculto en vez de cambiar la direccion de la pagina. Navegando
    // directo, el navegador descarga la pagina para abrir la app y al volver la recarga: por eso
    // el sistema insistia en abrir RawBT una y otra vez.
    const marco = document.createElement('iframe')
    marco.style.display = 'none'
    marco.src = enlace
    document.body.appendChild(marco)
    window.setTimeout(() => marco.remove(), 3000)
    return true
  } catch {
    return false
  }
}

/** RawBT es una app de Android; en PC no existe y hay que imprimir por el navegador. */
export function esAndroid() {
  return /android/i.test(navigator.userAgent)
}

const CLAVE_MODO = 'modo-impresion'

export type ModoImpresion = 'rawbt' | 'navegador'

export function modoImpresion(): ModoImpresion {
  try {
    const guardado = window.localStorage.getItem(CLAVE_MODO)
    if (guardado === 'rawbt' || guardado === 'navegador') return guardado
  } catch {
    // Sin acceso al almacenamiento se decide por el dispositivo.
  }
  // En celular y tablet arranca en RawBT: es el unico modo que corta el papel y no muestra el
  // dialogo del navegador. En PC no existe RawBT, asi que ahi va por navegador. El interruptor
  // sigue disponible en las dos pantallas por si hay que volver atras en pleno servicio.
  return esAndroid() ? 'rawbt' : 'navegador'
}

export function guardarModoImpresion(modo: ModoImpresion) {
  try {
    window.localStorage.setItem(CLAVE_MODO, modo)
  } catch {
    // Si no se puede guardar, igual funciona: solo no se recuerda al recargar.
  }
}

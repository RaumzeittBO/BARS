import { Capacitor } from '@capacitor/core'
import PachaxBluetoothPrinter, { type NativePairedBluetoothDevice } from '../../plugins/pachaxBluetoothPrinter'
import PachaxBluetoothPermissions from '../../plugins/pachaxBluetoothPermissions'
import type { Order, PrinterConfig } from '../../types'
import { formatCurrency, formatExtrasList } from '../../lib/format'
import { formatTicketDateTime } from '../../lib/escpos'

const PRINTER_STORAGE_KEY = 'bars:printer_config'

const DEFAULT_CONFIG: PrinterConfig = {
  enabled: true,
  autoPrint: true,
  paperWidth: '58mm',
  deviceAddress: '',
  deviceName: '',
  connectionType: 'bluetooth',
}

// Byte constants for ESC/POS commands
const ESC = 0x1b
const GS = 0x1d

const CP850_TABLE: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6,
}

function encodeText(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const mapped = CP850_TABLE[char]
    if (mapped !== undefined) {
      bytes.push(mapped)
    } else {
      const code = char.charCodeAt(0)
      bytes.push(code < 128 ? code : 0x20)
    }
  }
  return bytes
}

export class EscPosBuilder {
  private bytes: number[] = []
  private readonly lineWidth: number

  constructor(paperWidth: '58mm' | '80mm' = '58mm') {
    this.lineWidth = paperWidth === '80mm' ? 48 : 32
  }

  getLineWidth(): number {
    return this.lineWidth
  }

  init(): this {
    this.bytes.push(ESC, 0x40) // Initialize printer
    this.bytes.push(ESC, 0x74, 0x02) // Select CP850 table
    return this
  }

  align(alignment: 'left' | 'center' | 'right'): this {
    const val = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0
    this.bytes.push(ESC, 0x61, val)
    return this
  }

  bold(enable: boolean): this {
    this.bytes.push(ESC, 0x45, enable ? 1 : 0)
    return this
  }

  size(widthMultiplier: number = 1, heightMultiplier: number = 1): this {
    const w = Math.min(8, Math.max(1, widthMultiplier)) - 1
    const h = Math.min(8, Math.max(1, heightMultiplier)) - 1
    this.bytes.push(GS, 0x21, (h << 4) | w)
    return this
  }

  line(text: string = ''): this {
    this.bytes.push(...encodeText(text), 0x0a)
    return this
  }

  divider(char: string = '-'): this {
    const pattern = char.repeat(this.lineWidth)
    return this.line(pattern)
  }

  twoColumns(left: string, right: string): this {
    const maxLeft = this.lineWidth - right.length - 1
    const cleanLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left
    const spacesNeeded = Math.max(1, this.lineWidth - cleanLeft.length - right.length)
    const formatted = cleanLeft + ' '.repeat(spacesNeeded) + right
    return this.line(formatted)
  }

  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.bytes.push(0x0a)
    }
    return this
  }

  cut(): this {
    this.feed(3)
    this.bytes.push(GS, 0x56, 0x42, 0x00) // Partial paper cut
    return this
  }

  toBase64(): string {
    const uint8 = new Uint8Array(this.bytes)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < uint8.length; i += chunk) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  toByteArray(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

class BarsPrinterService {
  private config: PrinterConfig = DEFAULT_CONFIG
  private recentPrints = new Set<string>()

  constructor() {
    this.loadConfig()
  }

  loadConfig(): PrinterConfig {
    try {
      const raw = localStorage.getItem(PRINTER_STORAGE_KEY)
      if (raw) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      }
    } catch {
      this.config = DEFAULT_CONFIG
    }
    return this.config
  }

  saveConfig(newConfig: Partial<PrinterConfig>): PrinterConfig {
    this.config = { ...this.config, ...newConfig }
    try {
      localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(this.config))
    } catch (e) {
      console.error('Error al guardar configuración de impresora:', e)
    }
    return this.config
  }

  getConfig(): PrinterConfig {
    return { ...this.config }
  }

  isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android'
  }

  private async ensureBluetoothConnectPermission(): Promise<void> {
    const status = await PachaxBluetoothPermissions.checkPermissions()
    if (status.bluetoothConnect === 'granted' || status.bluetoothConnect === 'notRequired') return

    const requested = await PachaxBluetoothPermissions.requestConnectPermission()
    if (requested.bluetoothConnect !== 'granted' && requested.bluetoothConnect !== 'notRequired') {
      throw new Error('Autoriza Dispositivos cercanos para BARS en los ajustes de Android.')
    }
  }

  async listPairedDevices(): Promise<NativePairedBluetoothDevice[]> {
    if (!this.isAndroid()) {
      return []
    }
    try {
      await this.ensureBluetoothConnectPermission()
      const res = await PachaxBluetoothPrinter.listPairedDevices()
      return res.devices || []
    } catch (err) {
      console.warn('Error al listar dispositivos Bluetooth:', err)
      throw err
    }
  }

  async testConnection(address?: string): Promise<{ success: boolean; message: string }> {
    const targetAddress = address || this.config.deviceAddress
    if (!targetAddress) {
      return { success: false, message: 'No hay ninguna impresora configurada.' }
    }
    if (!this.isAndroid()) {
      return { success: false, message: 'La impresión Bluetooth requiere la aplicación Android.' }
    }
    try {
      await this.ensureBluetoothConnectPermission()
      const res = await PachaxBluetoothPrinter.connect({ address: targetAddress })
      return {
        success: res.connected,
        message: res.connected ? 'Impresora conectada con éxito.' : 'No se pudo conectar a la impresora.',
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error al conectar con la impresora Bluetooth.' }
    }
  }

  buildOrderTicket(order: Order, isDuplicate: boolean = false): EscPosBuilder {
    const builder = new EscPosBuilder(this.config.paperWidth)
    builder.init()

    // Encabezado BARS
    builder.align('center')
    builder.bold(true).size(2, 2).line('BARS').size(1, 1).bold(false)
    builder.line('SISTEMA DE GESTION')
    builder.line('PACHAX')
    if (isDuplicate) {
      builder.bold(true).line('*** COPIA / DUPLICADO ***').bold(false)
    }
    builder.divider('=')

    // Datos del pedido
    builder.bold(true).size(2, 1).line(`PEDIDO #${order.displayNumber}`).size(1, 1).bold(false)
    builder.feed(1)
    builder.align('left')
    builder.line(`Fecha: ${formatTicketDateTime(order.createdAt)}`)

    if (order.customerName) {
      builder.line(`Cliente: ${order.customerName}`)
    }
    if (order.customerPhone && order.customerPhone.trim().toLowerCase() !== 'sin telefono') {
      builder.line(`Tel: ${order.customerPhone}`)
    }

    const tipoEntrega =
      order.fulfillmentType === 'table'
        ? 'Mesa'
        : order.fulfillmentType === 'pickup'
          ? 'Para llevar / Recojo'
          : 'Delivery'
    builder.line(`Tipo: ${tipoEntrega}`)
    if (order.tableInfo) {
      builder.line(`Mesa/Detalle: ${order.tableInfo}`)
    }
    if (order.deliveryAddress) {
      builder.line(`Direccion: ${order.deliveryAddress}`)
    }

    builder.divider('-')

    // Lista de productos
    order.items.forEach((item) => {
      builder.bold(true)
      builder.twoColumns(`${item.quantity}x ${item.name}`, formatCurrency(item.lineTotal))
      builder.bold(false)

      if (item.modifiers.extras && item.modifiers.extras.length > 0) {
        builder.line(`  + ${formatExtrasList(item.modifiers.extras)}`)
      }
      if (item.modifiers.options && item.modifiers.options.length > 0) {
        builder.line(`  * ${item.modifiers.options.join(', ')}`)
      }
      if (item.modifiers.note) {
        builder.line(`  Obs: ${item.modifiers.note}`)
      }
    })

    builder.divider('-')

    // Totales
    if (order.productSubtotal && order.productSubtotal !== order.total) {
      builder.twoColumns('Subtotal:', formatCurrency(order.productSubtotal))
    }
    if (order.deliveryFee && order.deliveryFee > 0) {
      builder.twoColumns('Envio:', formatCurrency(order.deliveryFee))
    }

    builder.bold(true).size(1, 2)
    builder.twoColumns('TOTAL:', formatCurrency(order.total))
    builder.size(1, 1).bold(false)

    builder.divider('-')

    // Forma de Pago
    const metodo =
      order.payment?.method === 'qr'
        ? 'PAGO QR'
        : order.payment?.method === 'mixed'
          ? 'PAGO MIXTO'
          : 'EFECTIVO'
    builder.twoColumns('Metodo de Pago:', metodo)

    if (order.payment?.method === 'cash' && order.payment.cashReceived > 0) {
      builder.twoColumns('Recibido:', formatCurrency(order.payment.cashReceived))
      builder.twoColumns('Cambio:', formatCurrency(order.payment.change))
    } else if (order.payment?.method === 'mixed') {
      builder.twoColumns('Efectivo:', formatCurrency(order.payment.cashAmount))
      builder.twoColumns('QR:', formatCurrency(order.payment.qrAmount))
    }

    builder.divider('=')
    builder.align('center')
    builder.line('¡Gracias por su preferencia!')
    builder.line('bars.pachax.net')
    builder.cut()

    return builder
  }

  /**
   * Envía los bytes a la impresora configurada
   */
  async printRaw(builder: EscPosBuilder): Promise<{ success: boolean; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'La impresión está desactivada en la configuración.' }
    }

    if (!this.isAndroid()) {
      return { success: false, error: 'La impresión Bluetooth requiere la aplicación Android.' }
    }

    if (!this.config.deviceAddress) {
      return { success: false, error: 'No hay ninguna impresora Bluetooth seleccionada.' }
    }

    try {
      await this.ensureBluetoothConnectPermission()
      // Conectar si no está conectado
      await PachaxBluetoothPrinter.connect({ address: this.config.deviceAddress })

      // Enviar datos
      const dataBase64 = builder.toBase64()
      await PachaxBluetoothPrinter.write({ dataBase64 })

      return { success: true }
    } catch (err: any) {
      console.error('Error al imprimir por Bluetooth:', err)
      return {
        success: false,
        error: err?.message || 'Error de comunicación con la impresora térmica.',
      }
    }
  }

  /**
   * IMPRESIÓN AUTOMÁTICA OBLIGATORIA
   *
   * Se dispara automáticamente al confirmar la venta.
   * - No muestra modales de confirmación ni diálogos.
   * - Previene impresiones duplicadas por reintentos o doble clic.
   * - Si la impresora falla, la venta NO se bloquea y se avisa con mensaje discreto.
   */
  async printOrderAutomatically(order: Order): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    if (!this.config.autoPrint || !this.config.enabled) {
      return { success: true, skipped: true }
    }

    // Prevención de duplicados (antirebote por id de pedido)
    if (this.recentPrints.has(order.id)) {
      return { success: true, skipped: true }
    }

    this.recentPrints.add(order.id)
    // Limpiar caché de recientes tras 10 minutos
    setTimeout(() => {
      this.recentPrints.delete(order.id)
    }, 10 * 60 * 1000)

    const builder = this.buildOrderTicket(order, false)
    const result = await this.printRaw(builder)

    if (!result.success) {
      // Si falló, permitimos reintentar luego
      this.recentPrints.delete(order.id)
    }

    return result
  }

  /**
   * Reimpresión manual desde el historial
   */
  async reprintOrder(order: Order): Promise<{ success: boolean; error?: string }> {
    const builder = this.buildOrderTicket(order, true)
    return await this.printRaw(builder)
  }
}

export const barsPrinterService = new BarsPrinterService()

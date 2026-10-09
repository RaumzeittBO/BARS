import { Check, CheckCircle2, Printer, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { barsPrinterService } from '../services/printer/barsPrinterService'
import type { NativePairedBluetoothDevice } from '../plugins/pachaxBluetoothPrinter'
import type { PrinterConfig } from '../types'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

export function PrinterSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [config, setConfig] = useState<PrinterConfig>(() => barsPrinterService.getConfig())
  const [pairedDevices, setPairedDevices] = useState<NativePairedBluetoothDevice[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [testingStatus, setTestingStatus] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const isAndroid = barsPrinterService.isAndroid()

  const loadDevices = async () => {
    setIsSearching(true)
    setTestingStatus(null)
    try {
      const list = await barsPrinterService.listPairedDevices()
      setPairedDevices(list)
    } catch (error) {
      setPairedDevices([])
      setTestingStatus(error instanceof Error ? error.message : 'No se pudieron consultar las impresoras Bluetooth.')
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setConfig(barsPrinterService.getConfig())
      loadDevices()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSelectDevice = (dev: NativePairedBluetoothDevice) => {
    const updated = barsPrinterService.saveConfig({
      deviceAddress: dev.address,
      deviceName: dev.name,
    })
    setConfig(updated)
    setFeedback(`Impresora "${dev.name}" seleccionada.`)
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleToggleAutoPrint = (val: boolean) => {
    const updated = barsPrinterService.saveConfig({ autoPrint: val })
    setConfig(updated)
  }

  const handleSelectPaper = (width: '58mm' | '80mm') => {
    const updated = barsPrinterService.saveConfig({ paperWidth: width })
    setConfig(updated)
  }

  const handleTestPrint = async () => {
    setTestingStatus('Probando conexión...')
    try {
      const res = await barsPrinterService.testConnection()
      if (res.success) {
        setTestingStatus('¡Conexión exitosa! Enviando prueba...')
        // Crear pedido de prueba para imprimir
        const testOrder: any = {
          id: `test-${Date.now()}`,
          displayNumber: 'PRUEBA',
          createdAt: new Date().toISOString(),
          customerName: 'Prueba de Impresión',
          fulfillmentType: 'table',
          tableInfo: 'Mesa 1',
          items: [
            {
              id: 'test-1',
              name: 'Hamburguesa BARS Test',
              quantity: 1,
              lineTotal: 25,
              modifiers: { extras: [], options: [], note: '' },
            },
          ],
          total: 25,
          payment: { method: 'cash', cashAmount: 25, qrAmount: 0, cashReceived: 50, change: 25 },
          paymentStatus: 'paid',
        }
        const printResult = await barsPrinterService.reprintOrder(testOrder)
        setTestingStatus(printResult.success ? 'Prueba impresa correctamente.' : `Error: ${printResult.error || 'No se pudo imprimir la prueba.'}`)
      } else {
        setTestingStatus(`Error: ${res.message}`)
      }
    } catch (e: any) {
      setTestingStatus(`Error: ${e?.message || 'Fallo de conexión'}`)
    }
    setTimeout(() => setTestingStatus(null), 5000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Panel className="w-full max-w-lg p-6 border-[#333333] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF6A00]/15 text-[#FF6A00]">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Configuración de Impresora Térmica</h3>
              <p className="text-[11px] text-[#888888]">ESC/POS Bluetooth para Android y Web</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#777777] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {feedback && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-950/40 border border-emerald-800 p-2.5 text-xs text-emerald-300">
              <CheckCircle2 size={14} />
              {feedback}
            </div>
          )}

          {/* Estado actual / Dispositivo seleccionado */}
          <div className="rounded-2xl bg-[#1A1A1A] p-4 border border-[#282828]">
            <p className="text-[11px] font-bold text-[#888888] uppercase tracking-wider">Impresora Activa</p>
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className="text-sm font-bold text-white">
                  {config.deviceName || (config.deviceAddress ? config.deviceAddress : 'Ninguna impresora vinculada')}
                </p>
                {config.deviceAddress && (
                  <p className="text-[10px] font-mono text-[#777777]">{config.deviceAddress}</p>
                )}
              </div>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  config.deviceAddress
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {config.deviceAddress ? 'Configurada' : 'Sin configurar'}
              </span>
            </div>
          </div>

          {/* Opciones de Impresión */}
          <div className="grid grid-cols-2 gap-3">
            {/* Ancho de papel */}
            <div className="rounded-2xl bg-[#1A1A1A] p-3 border border-[#282828]">
              <label className="block text-xs font-semibold text-[#CCCCCC] mb-2">Ancho de Papel</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectPaper('58mm')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                    config.paperWidth === '58mm'
                      ? 'bg-[#FF6A00] text-white shadow-glow'
                      : 'bg-[#222222] text-[#888888] hover:text-white'
                  }`}
                >
                  58 mm (Estándar)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPaper('80mm')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                    config.paperWidth === '80mm'
                      ? 'bg-[#FF6A00] text-white shadow-glow'
                      : 'bg-[#222222] text-[#888888] hover:text-white'
                  }`}
                >
                  80 mm (Ancho)
                </button>
              </div>
            </div>

            {/* Impresión automática */}
            <div className="rounded-2xl bg-[#1A1A1A] p-3 border border-[#282828] flex flex-col justify-between">
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC]">Impresión Automática</label>
                <p className="text-[10px] text-[#777777] mt-0.5">Al confirmar venta en el POS</p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleToggleAutoPrint(!config.autoPrint)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    config.autoPrint ? 'bg-[#FF6A00]' : 'bg-[#333333]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      config.autoPrint ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs font-bold text-white">
                  {config.autoPrint ? 'Activada' : 'Manual'}
                </span>
              </div>
            </div>
          </div>

          {/* Lista de Dispositivos Bluetooth Emparejados en Android */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[#CCCCCC]">Dispositivos Bluetooth Emparejados</label>
              {isAndroid && (
                <button
                  type="button"
                  onClick={loadDevices}
                  disabled={isSearching}
                  className="text-xs text-[#FF6A00] hover:underline flex items-center gap-1 font-semibold"
                >
                  <RefreshCw size={12} className={isSearching ? 'animate-spin' : ''} />
                  Actualizar lista
                </button>
              )}
            </div>

            {!isAndroid ? (
              <div className="rounded-xl border border-[#282828] bg-[#18181A] p-3 text-xs text-[#888888]">
                En el navegador web, el sistema utiliza el controlador nativo o la vista previa de impresión. Para vincular impresoras térmicas Bluetooth portátiles directas, utiliza la aplicación Android instalada.
              </div>
            ) : pairedDevices.length === 0 ? (
              <div className="rounded-xl border border-[#282828] bg-[#18181A] p-4 text-center text-xs text-[#777777]">
                {isSearching ? 'Buscando dispositivos vinculados...' : 'No se encontraron dispositivos Bluetooth vinculados en Android. Vincula tu impresora en los Ajustes de Bluetooth del teléfono primero.'}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {pairedDevices.map((dev) => {
                  const isSelected = config.deviceAddress === dev.address
                  return (
                    <button
                      key={dev.address}
                      onClick={() => handleSelectDevice(dev)}
                      className={`w-full flex items-center justify-between rounded-xl p-2.5 text-xs text-left border transition ${
                        isSelected
                          ? 'border-[#FF6A00] bg-[#FF6A00]/15 text-white font-bold'
                          : 'border-[#262626] bg-[#1A1A1A] text-[#CCCCCC] hover:border-[#383838]'
                      }`}
                    >
                      <div>
                        <p>{dev.name || 'Impresora Bluetooth'}</p>
                        <p className="text-[10px] font-mono text-[#777777]">{dev.address}</p>
                      </div>
                      {isSelected && <Check size={16} className="text-[#FF6A00]" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {testingStatus && (
            <div className="rounded-xl bg-[#202020] border border-[#333333] p-2.5 text-xs text-white text-center font-semibold">
              {testingStatus}
            </div>
          )}

          {/* Acciones */}
          <div className="pt-2 flex items-center justify-between border-t border-[#262626]">
            <Button
              type="button"
              tone="secondary"
              size="sm"
              disabled={!config.deviceAddress && isAndroid}
              onClick={handleTestPrint}
            >
              Imprimir Ticket de Prueba
            </Button>
            <Button type="button" tone="primary" size="sm" onClick={onClose}>
              Guardar y Cerrar
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

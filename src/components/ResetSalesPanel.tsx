import { AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'
import { useOrdersStore } from '../store/appStore'

export function ResetSalesPanel() {
  const { state: { orders }, deleteOrder } = useOrdersStore()
  const [borrando, setBorrando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const handleReset = async () => {
    if (orders.length === 0) {
      setMensaje('No hay pedidos para reiniciar.')
      return
    }

    const confirmar = window.confirm(
      `¿Deseas eliminar los ${orders.length} pedidos registrados para pruebas y comenzar con el historial limpio?`
    )
    if (!confirmar) return

    setBorrando(true)
    setMensaje(null)
    try {
      let count = 0
      for (const order of orders) {
        await deleteOrder(order.id)
        count++
      }
      setMensaje(`Se eliminaron con éxito ${count} pedidos de prueba.`)
    } catch (err: any) {
      setMensaje(`Error al limpiar: ${err?.message || 'Error desconocido'}`)
    } finally {
      setBorrando(false)
    }
  }

  return (
    <Panel className="p-6 border-red-900/30 bg-red-950/10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-red-500 font-bold">
            <AlertTriangle size={18} />
            <h4>Limpieza de Ventas de Prueba</h4>
          </div>
          <p className="text-xs text-[#9E9E9E] mt-1 max-w-xl">
            Permite reiniciar el historial de ventas para empezar operaciones reales en BARS. No modifica productos, categorías ni usuarios.
          </p>
          {mensaje && (
            <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-emerald-400">
              <CheckCircle2 size={14} />
              {mensaje}
            </div>
          )}
        </div>
        <Button
          tone="secondary"
          size="sm"
          disabled={borrando || orders.length === 0}
          onClick={handleReset}
          className="border-red-800/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
        >
          <Trash2 size={14} />
          {borrando ? 'Limpiando...' : `Limpiar (${orders.length})`}
        </Button>
      </div>
    </Panel>
  )
}

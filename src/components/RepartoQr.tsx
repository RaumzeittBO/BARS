import { formatCurrency } from '../lib/format'
import {
  cambiarCantidadDeCuentas,
  diferenciaConTotal,
  MAX_CUENTAS_QR,
  MIN_CUENTAS_QR,
  montoDesdeTexto,
  montosDesdeTextos,
  repartoCuadra,
} from '../lib/qrSplit'

export type ModoQr = 'unico' | 'multiple'

/**
 * Reparto del cobro por QR entre varias cuentas. Aparece solo si se elige "QR multiple"; con
 * "QR unico" (lo predeterminado) no se muestra nada y el pago se guarda igual que siempre.
 */
export function RepartoQr({
  total,
  modo,
  onCambiarModo,
  montos,
  onCambiarMontos,
}: {
  total: number
  modo: ModoQr
  onCambiarModo: (modo: ModoQr) => void
  montos: string[]
  onCambiarMontos: (montos: string[]) => void
}) {
  const valores = montosDesdeTextos(montos)
  const falta = diferenciaConTotal(valores, total)
  const cuadra = repartoCuadra(valores, total)

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {([
          { id: 'unico', etiqueta: 'QR unico' },
          { id: 'multiple', etiqueta: 'QR multiple' },
        ] as Array<{ id: ModoQr; etiqueta: string }>).map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            onClick={() => onCambiarModo(opcion.id)}
            className={`rounded-[0.7rem] border px-2.5 py-2 text-xs font-black transition ${
              modo === opcion.id
                ? 'border-accent bg-accent text-white shadow-sm'
                : 'border-line bg-canvas/30 text-muted hover:text-ink'
            }`}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {modo === 'multiple' ? (
        <div className="space-y-1.5 rounded-[0.7rem] border border-line bg-panel/50 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-muted">Cuentas</span>
            <div className="flex gap-1">
              {Array.from({ length: MAX_CUENTAS_QR - MIN_CUENTAS_QR + 1 }, (_, i) => i + MIN_CUENTAS_QR).map((cantidad) => (
                <button
                  key={cantidad}
                  type="button"
                  onClick={() => onCambiarMontos(cambiarCantidadDeCuentas(montos, cantidad))}
                  className={`h-9 w-9 rounded-lg text-xs font-black transition ${
                    montos.length === cantidad
                      ? 'bg-ink text-white shadow-sm'
                      : 'border border-line bg-white text-muted hover:text-ink'
                  }`}
                >
                  {cantidad}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {montos.map((monto, indice) => (
              <label key={indice} className="block">
                <div className="mb-1 text-[9px] font-black uppercase tracking-wider text-muted">Cuenta {indice + 1}</div>
                <input
                  className={`w-full rounded-[0.7rem] border bg-canvas/30 px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent ${
                    montoDesdeTexto(monto) > 0 ? 'border-line' : 'border-red-300'
                  }`}
                  inputMode="decimal"
                  placeholder="0"
                  value={monto}
                  onChange={(evento) => {
                    const copia = [...montos]
                    copia[indice] = evento.target.value
                    onCambiarMontos(copia)
                  }}
                />
              </label>
            ))}
          </div>

          <div
            className={`flex items-center justify-between rounded-[0.7rem] px-2.5 py-1.5 text-xs font-black ${
              cuadra ? 'bg-emerald-50 text-emerald-800' : 'bg-warningSoft text-warning'
            }`}
          >
            <span>{cuadra ? 'Cuadra con el total' : falta > 0 ? 'Falta asignar' : 'Se paso del total'}</span>
            <span>{cuadra ? formatCurrency(total) : formatCurrency(Math.abs(falta))}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

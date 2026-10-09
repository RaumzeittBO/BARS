import { Printer, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { guardarModoImpresion, modoImpresion, type ModoImpresion } from '../lib/escpos'

/**
 * Permite cambiar como imprime ESTA tablet, sin tocar las demas (se guarda en el navegador).
 *
 * Existe por dos motivos: en la PC no hay RawBT y hay que usar el navegador, y si en pleno
 * servicio RawBT falla, se puede volver a la impresion de siempre en un toque en vez de
 * quedarse sin tickets.
 */
export function PrintModeToggle() {
  const [modo, setModo] = useState<ModoImpresion>(() => modoImpresion())

  const cambiar = (siguiente: ModoImpresion) => {
    guardarModoImpresion(siguiente)
    setModo(siguiente)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-[0.9rem] border border-line bg-white/80 p-1 shadow-sm">
      <span className="px-2 text-[9px] font-black uppercase tracking-wider text-muted">Impresion</span>
      <button
        type="button"
        onClick={() => cambiar('rawbt')}
        title="Manda el ticket a RawBT: corta el papel y no muestra dialogo"
        className={`flex items-center gap-1.5 rounded-[0.7rem] px-2.5 py-1 text-[11px] font-black transition ${
          modo === 'rawbt' ? 'bg-ink text-white shadow-sm' : 'text-ink hover:bg-panel'
        }`}
      >
        <Smartphone size={12} />
        RAWBT
      </button>
      <button
        type="button"
        onClick={() => cambiar('navegador')}
        title="Impresion normal del navegador (no corta el papel)"
        className={`flex items-center gap-1.5 rounded-[0.7rem] px-2.5 py-1 text-[11px] font-black transition ${
          modo === 'navegador' ? 'bg-ink text-white shadow-sm' : 'text-ink hover:bg-panel'
        }`}
      >
        <Printer size={12} />
        NAVEGADOR
      </button>
    </div>
  )
}

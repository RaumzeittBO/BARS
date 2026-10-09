import {
  AlertCircle,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  History,
  Lock,
  Plus,
  QrCode,
  ShieldCheck,
  Store,
  Unlock,
  User,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../lib/format'
import { barsCashService } from '../services/cash/barsCashService'
import type { CashShift, Order, UserRole } from '../types'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

export function ArqueoView({
  orders,
  userName,
  userRole: _userRole,
}: {
  orders: Order[]
  userName: string
  userRole: UserRole | 'demo'
}) {
  const [activeShift, setActiveShift] = useState<CashShift | null>(() => barsCashService.getActiveShift())
  const [historyShifts, setHistoryShifts] = useState<CashShift[]>(() => barsCashService.getShiftHistory())
  const [, setTick] = useState(0)

  // Modales
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')

  // Inputs para apertura
  const [openInitialCash, setOpenInitialCash] = useState('100')
  const [openBranch, setOpenBranch] = useState('Sucursal Principal')

  // Inputs para gasto menor
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseMotive, setExpenseMotive] = useState('')

  // Inputs para arqueo final
  const [countedCashInput, setCountedCashInput] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [isSubmittingClosure, setIsSubmittingClosure] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  useEffect(() => {
    const unsub = barsCashService.subscribe(() => {
      setActiveShift(barsCashService.getActiveShift())
      setHistoryShifts(barsCashService.getShiftHistory())
      setTick((t) => t + 1)
    })
    return unsub
  }, [])

  // Métricas del turno activo
  const metrics = useMemo(() => {
    if (!activeShift) return null
    return barsCashService.calculateShiftMetrics(activeShift, orders)
  }, [activeShift, orders])

  const countedCash = Number(countedCashInput) || 0
  const expectedCash = metrics ? metrics.expectedCash : 0
  const difference = Math.round((countedCash - expectedCash) * 100) / 100

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number(openInitialCash) || 0
    barsCashService.openShift({
      initialCash: amount,
      responsible: userName,
      branch: openBranch,
    })
    setShowOpenModal(false)
    setFeedbackMessage('Turno de caja abierto correctamente.')
    setTimeout(() => setFeedbackMessage(null), 4000)
  }

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number(expenseAmount) || 0
    if (amount <= 0 || !expenseMotive.trim()) return

    barsCashService.addExpense({
      amount,
      motive: expenseMotive.trim(),
      responsible: userName,
    })

    setExpenseAmount('')
    setExpenseMotive('')
    setShowExpenseModal(false)
    setFeedbackMessage('Gasto menor registrado en el turno.')
    setTimeout(() => setFeedbackMessage(null), 4000)
  }

  const handleCloseShift = async () => {
    if (!activeShift || !metrics) return

    const confirmMessage = [
      '¿Confirmas el cierre de caja y arqueo de turno?',
      '',
      `Efectivo Esperado: ${formatCurrency(metrics.expectedCash)}`,
      `Efectivo Contado:  ${formatCurrency(countedCash)}`,
      `Diferencia:        ${formatCurrency(difference)} ${difference > 0 ? '(Sobrante)' : difference < 0 ? '(Faltante)' : '(Exacto)'}`,
      '',
      'Esta operación guardará un registro inalterable del turno.',
    ].join('\n')

    if (!window.confirm(confirmMessage)) return

    setIsSubmittingClosure(true)
    try {
      barsCashService.closeShift({
        shiftId: activeShift.id,
        actualCash: countedCash,
        responsible: userName,
        notes: closingNotes,
        orders,
      })
      setCountedCashInput('')
      setClosingNotes('')
      setFeedbackMessage('¡Caja cerrada y arqueo generado con éxito!')
      setTimeout(() => setFeedbackMessage(null), 5000)
    } catch (err: any) {
      alert(`Error al cerrar caja: ${err?.message || 'Error desconocido'}`)
    } finally {
      setIsSubmittingClosure(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF6A00]/15 text-[#FF6A00] border border-[#FF6A00]/30 shadow-glow">
              <WalletCards size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Caja & Arqueo de Turno</h2>
              <p className="text-xs text-[#9E9E9E]">Control de efectivo, salidas menores y conciliación final de caja.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeShift ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 px-3.5 py-1.5 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold">Turno Activo</span>
              <span className="text-emerald-400/70">· {activeShift.openedBy}</span>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowOpenModal(true)} className="gap-2">
              <Unlock size={16} />
              Apertura de Caja
            </Button>
          )}

          <div className="flex rounded-2xl bg-[#1A1A1A] p-1 border border-[#2E2E2E]">
            <button
              onClick={() => setActiveTab('current')}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                activeTab === 'current' ? 'bg-[#FF6A00] text-white' : 'text-[#9E9E9E] hover:text-white'
              }`}
            >
              Turno Actual
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                activeTab === 'history' ? 'bg-[#FF6A00] text-white' : 'text-[#9E9E9E] hover:text-white'
              }`}
            >
              Historial ({historyShifts.length})
            </button>
          </div>
        </div>
      </div>

      {feedbackMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/50 border border-emerald-800 p-3 text-xs font-semibold text-emerald-300">
          <CheckCircle2 size={16} />
          {feedbackMessage}
        </div>
      )}

      {activeTab === 'current' ? (
        activeShift ? (
          <div className="space-y-6">
            {/* TRES TARJETAS RESUMEN (REFERENCIA OBLIGATORIA) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tarjeta 1: Apertura de Caja */}
              <Panel className="p-5 border-[#262626] bg-[#141414] hover:border-[#383838] transition">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Store size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider bg-[#1E1E1E] px-2.5 py-1 rounded-full border border-[#2E2E2E]">
                    Fondo Inicial
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#9E9E9E]">Apertura de Caja</p>
                  <p className="text-2xl sm:text-3xl font-black text-white mt-1">
                    {formatCurrency(activeShift.initialCash)}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-[#222222] flex items-center justify-between text-[11px] text-[#777777]">
                  <span className="flex items-center gap-1">
                    <User size={12} /> {activeShift.openedBy}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </Panel>

              {/* Tarjeta 2: Ventas en Efectivo */}
              <Panel className="p-5 border-[#262626] bg-[#141414] hover:border-[#383838] transition">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Coins size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-800/40">
                    {metrics?.orderCount || 0} Ventas
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#9E9E9E]">Ventas en Efectivo</p>
                  <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
                    {formatCurrency(metrics?.cashSales || 0)}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-[#222222] flex items-center justify-between text-[11px] text-[#777777]">
                  <span className="flex items-center gap-1 text-[#9E9E9E]">
                    <QrCode size={12} /> QR: <strong className="text-white">{formatCurrency(metrics?.qrSales || 0)}</strong>
                  </span>
                  <span className="text-[10px] text-[#555555]">(QR no suma a caja)</span>
                </div>
              </Panel>

              {/* Tarjeta 3: Gastos Menores / Salidas */}
              <Panel className="p-5 border-[#262626] bg-[#141414] hover:border-[#383838] transition">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <ArrowDownRight size={20} />
                  </div>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#FF6A00] hover:text-white bg-[#FF6A00]/10 hover:bg-[#FF6A00] px-2.5 py-1 rounded-full border border-[#FF6A00]/30 transition"
                  >
                    <Plus size={12} /> Registrar Gasto
                  </button>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#9E9E9E]">Gastos Menores / Salidas</p>
                  <p className="text-2xl sm:text-3xl font-black text-rose-400 mt-1">
                    {formatCurrency(metrics?.expenses || 0)}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-[#222222] flex items-center justify-between text-[11px] text-[#777777]">
                  <span>{metrics?.shiftExpenses.length || 0} salidas registradas</span>
                  <span className="text-[10px] text-rose-400/80">Descontado de caja</span>
                </div>
              </Panel>
            </div>

            {/* SECCIÓN PRINCIPAL: FORMULARIO DE ARQUEO FINAL */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Formulario de Arqueo */}
              <Panel className="lg:col-span-7 p-6 border-[#2E2E2E] bg-[#141414]">
                <div className="flex items-center justify-between border-b border-[#222222] pb-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="text-[#FF6A00]" size={20} />
                    <h3 className="font-bold text-lg text-white">Arqueo Final de Efectivo</h3>
                  </div>
                  <span className="text-xs text-[#777777]">Turno #{activeShift.id.slice(-6)}</span>
                </div>

                {/* Fórmula de Efectivo Esperado */}
                <div className="mt-5 rounded-2xl bg-[#1A1A1A] p-4 border border-[#282828] space-y-2.5 text-xs">
                  <div className="flex justify-between text-[#9E9E9E]">
                    <span>Fondo Inicial (+)</span>
                    <span className="font-mono text-white font-bold">{formatCurrency(activeShift.initialCash)}</span>
                  </div>
                  <div className="flex justify-between text-[#9E9E9E]">
                    <span>Ventas en Efectivo (+)</span>
                    <span className="font-mono text-emerald-400 font-bold">{formatCurrency(metrics?.cashSales || 0)}</span>
                  </div>
                  {metrics?.expenses ? (
                    <div className="flex justify-between text-[#9E9E9E]">
                      <span>Gastos Menores / Salidas (-)</span>
                      <span className="font-mono text-rose-400 font-bold">-{formatCurrency(metrics.expenses)}</span>
                    </div>
                  ) : null}
                  <div className="pt-2 border-t border-[#2E2E2E] flex justify-between items-center text-sm">
                    <span className="font-bold text-white">Efectivo Esperado en Caja:</span>
                    <span className="font-mono text-xl font-black text-[#FF6A00]">
                      {formatCurrency(expectedCash)}
                    </span>
                  </div>
                </div>

                {/* Entrada de Efectivo Contado */}
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#CCCCCC] mb-1.5">
                      Efectivo Realmente Contado en Gaveta (Bs)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-[#777777]">Bs</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="0.00"
                        value={countedCashInput}
                        onChange={(e) => setCountedCashInput(e.target.value)}
                        className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] py-3.5 pl-12 pr-4 text-2xl font-black text-white outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]"
                      />
                    </div>
                  </div>

                  {/* Cuadro de Diferencia (Sobrante / Faltante / Cuadrado) */}
                  {countedCashInput !== '' && (
                    <div
                      className={`rounded-2xl p-4 border text-xs flex items-center justify-between ${
                        difference === 0
                          ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                          : difference > 0
                            ? 'bg-blue-950/40 border-blue-800 text-blue-300'
                            : 'bg-rose-950/40 border-rose-800 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {difference === 0 ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <AlertCircle size={18} />
                        )}
                        <div>
                          <p className="font-bold">
                            {difference === 0
                              ? 'Caja Cuadrada Exacta'
                              : difference > 0
                                ? 'Sobrante de Efectivo'
                                : 'Faltante de Efectivo'}
                          </p>
                          <p className="text-[11px] opacity-80">
                            {difference === 0
                              ? 'El monto contado coincide con el esperado.'
                              : difference > 0
                                ? 'Hay más dinero en gaveta del registrado en ventas.'
                                : 'Falta dinero en gaveta según las ventas registradas.'}
                          </p>
                        </div>
                      </div>
                      <span className="text-lg font-black font-mono">
                        {difference > 0 ? `+${formatCurrency(difference)}` : formatCurrency(difference)}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#9E9E9E] mb-1">
                      Observaciones del Arqueo / Cierre
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Notas adicionales, justificativo de diferencias, etc."
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      className="w-full rounded-xl border border-[#2E2E2E] bg-[#1A1A1A] p-3 text-xs text-white placeholder-[#555555] outline-none focus:border-[#FF6A00]"
                    />
                  </div>

                  <Button
                    fullWidth
                    size="lg"
                    tone="primary"
                    disabled={isSubmittingClosure || countedCashInput === ''}
                    onClick={handleCloseShift}
                    className="shadow-glow"
                  >
                    <Lock size={18} />
                    Cerrar caja y generar arqueo
                  </Button>
                </div>
              </Panel>

              {/* Lista de Gastos Menores del Turno */}
              <Panel className="lg:col-span-5 p-5 border-[#262626] bg-[#141414] flex flex-col">
                <div className="flex items-center justify-between border-b border-[#222222] pb-3">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <FileText size={16} className="text-[#FF6A00]" />
                    Salidas del Turno Actual
                  </h4>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="text-xs text-[#FF6A00] hover:underline font-semibold"
                  >
                    + Agregar
                  </button>
                </div>

                <div className="mt-3 flex-1 overflow-y-auto max-h-[360px] space-y-2 pr-1">
                  {metrics?.shiftExpenses.length === 0 ? (
                    <div className="text-center py-10 text-xs text-[#666666]">
                      No hay salidas de efectivo registradas en este turno.
                    </div>
                  ) : (
                    metrics?.shiftExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="rounded-xl border border-[#262626] bg-[#18181A] p-3 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{exp.motive}</p>
                          <p className="text-[10px] text-[#777777] mt-0.5">
                            {exp.responsible} · {new Date(exp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold text-rose-400 shrink-0">
                          -{formatCurrency(exp.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </div>
        ) : (
          /* Estado sin turno abierto */
          <Panel className="p-12 text-center border-[#262626] bg-[#141414] max-w-xl mx-auto">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FF6A00]/10 text-[#FF6A00] mx-auto border border-[#FF6A00]/20 shadow-glow">
              <Store size={32} />
            </div>
            <h3 className="mt-5 text-xl font-black text-white">No hay turno de caja abierto</h3>
            <p className="mt-2 text-xs text-[#9E9E9E] max-w-md mx-auto">
              Para registrar ventas en efectivo con trazabilidad y controlar el arqueo al final del día, realiza la apertura de caja.
            </p>
            <Button size="lg" className="mt-6 mx-auto gap-2" onClick={() => setShowOpenModal(true)}>
              <Unlock size={18} />
              Abrir Turno de Caja
            </Button>
          </Panel>
        )
      ) : (
        /* Pestaña: Historial de Turnos Cerrados */
        <Panel className="p-6 border-[#262626] bg-[#141414]">
          <h3 className="font-bold text-base text-white mb-4 flex items-center gap-2">
            <History size={18} className="text-[#FF6A00]" />
            Historial de Arqueos y Cierres de Turno
          </h3>

          {historyShifts.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#666666]">
              Aún no hay turnos cerrados en el historial.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#262626] text-[#777777] font-semibold">
                    <th className="pb-3 pl-2">Fecha / Turno</th>
                    <th className="pb-3">Cajero</th>
                    <th className="pb-3 text-right">Apertura</th>
                    <th className="pb-3 text-right">Ventas Efec.</th>
                    <th className="pb-3 text-right">Gastos</th>
                    <th className="pb-3 text-right">Esperado</th>
                    <th className="pb-3 text-right">Contado</th>
                    <th className="pb-3 text-right pr-2">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F1F]">
                  {historyShifts.map((shift) => (
                    <tr key={shift.id} className="hover:bg-[#1A1A1A] transition">
                      <td className="py-3 pl-2">
                        <div className="font-bold text-white">
                          {new Date(shift.openedAt).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-[#777777]">
                          {new Date(shift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {shift.closedAt ? new Date(shift.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Abierto'}
                        </div>
                      </td>
                      <td className="py-3 font-semibold text-[#CCCCCC]">{shift.closedBy || shift.openedBy}</td>
                      <td className="py-3 text-right font-mono">{formatCurrency(shift.initialCash)}</td>
                      <td className="py-3 text-right font-mono text-emerald-400">+{formatCurrency(shift.cashSales)}</td>
                      <td className="py-3 text-right font-mono text-rose-400">-{formatCurrency(shift.expenses)}</td>
                      <td className="py-3 text-right font-mono font-bold text-white">{formatCurrency(shift.expectedCash)}</td>
                      <td className="py-3 text-right font-mono font-bold text-[#FF6A00]">
                        {shift.actualCash !== undefined ? formatCurrency(shift.actualCash) : '-'}
                      </td>
                      <td className="py-3 text-right pr-2">
                        {shift.difference !== undefined ? (
                          <span
                            className={`inline-block font-mono font-bold px-2 py-0.5 rounded-full text-[10px] ${
                              shift.difference === 0
                                ? 'bg-emerald-950/50 text-emerald-300'
                                : shift.difference > 0
                                  ? 'bg-blue-950/50 text-blue-300'
                                  : 'bg-rose-950/50 text-rose-300'
                            }`}
                          >
                            {shift.difference > 0 ? `+${formatCurrency(shift.difference)}` : formatCurrency(shift.difference)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* MODAL: APERTURA DE CAJA */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Panel className="w-full max-w-md p-6 border-[#333333] bg-[#141414] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Unlock size={18} className="text-[#FF6A00]" />
                Apertura de Turno de Caja
              </h3>
              <button onClick={() => setShowOpenModal(false)} className="text-[#777777] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleOpenShift} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Monto Inicial en Gaveta (Bs)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  required
                  value={openInitialCash}
                  onChange={(e) => setOpenInitialCash(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-lg font-bold text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Responsable del Turno</label>
                <input
                  type="text"
                  disabled
                  value={userName}
                  className="w-full rounded-2xl border border-[#282828] bg-[#181818] p-3 text-sm text-[#888888]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Sucursal / Ubicación</label>
                <input
                  type="text"
                  value={openBranch}
                  onChange={(e) => setOpenBranch(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" tone="secondary" onClick={() => setShowOpenModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" tone="primary">
                  Iniciar Turno
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {/* MODAL: REGISTRAR GASTO MENOR */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Panel className="w-full max-w-md p-6 border-[#333333] bg-[#141414] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <ArrowDownRight size={18} className="text-rose-400" />
                Registrar Gasto Menor / Salida
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-[#777777] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Importe de la Salida (Bs)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  placeholder="Ej: 25.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-lg font-bold text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CCCCCC] mb-1">Motivo / Justificación</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Compra de hielo, pago delivery moto..."
                  value={expenseMotive}
                  onChange={(e) => setExpenseMotive(e.target.value)}
                  className="w-full rounded-2xl border border-[#333333] bg-[#1A1A1A] p-3 text-sm text-white outline-none focus:border-[#FF6A00]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" tone="secondary" onClick={() => setShowExpenseModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" tone="primary">
                  Registrar Salida
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  )
}

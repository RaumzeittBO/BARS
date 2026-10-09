import type { CashExpense, CashShift, Order } from '../../types'

const SHIFTS_KEY = 'bars:cash_shifts'
const EXPENSES_KEY = 'bars:cash_expenses'
const ACTIVE_SHIFT_ID_KEY = 'bars:active_shift_id'

class BarsCashService {
  private shifts: CashShift[] = []
  private expenses: CashExpense[] = []
  private activeShiftId: string | null = null
  private listeners: Array<() => void> = []

  constructor() {
    this.loadData()
  }

  private loadData() {
    try {
      const rawShifts = localStorage.getItem(SHIFTS_KEY)
      this.shifts = rawShifts ? JSON.parse(rawShifts) : []

      const rawExpenses = localStorage.getItem(EXPENSES_KEY)
      this.expenses = rawExpenses ? JSON.parse(rawExpenses) : []

      this.activeShiftId = localStorage.getItem(ACTIVE_SHIFT_ID_KEY) || null

      // Validar si el activeShiftId realmente existe y sigue abierto
      if (this.activeShiftId) {
        const found = this.shifts.find((s) => s.id === this.activeShiftId && s.status === 'open')
        if (!found) {
          this.activeShiftId = null
          localStorage.removeItem(ACTIVE_SHIFT_ID_KEY)
        }
      }
    } catch {
      this.shifts = []
      this.expenses = []
      this.activeShiftId = null
    }
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private saveData() {
    try {
      localStorage.setItem(SHIFTS_KEY, JSON.stringify(this.shifts))
      localStorage.setItem(EXPENSES_KEY, JSON.stringify(this.expenses))
      if (this.activeShiftId) {
        localStorage.setItem(ACTIVE_SHIFT_ID_KEY, this.activeShiftId)
      } else {
        localStorage.removeItem(ACTIVE_SHIFT_ID_KEY)
      }
    } catch (e) {
      console.error('Error saving cash data:', e)
    }
    this.notify()
  }

  getActiveShift(): CashShift | null {
    if (!this.activeShiftId) return null
    return this.shifts.find((s) => s.id === this.activeShiftId && s.status === 'open') || null
  }

  openShift(input: {
    initialCash: number
    responsible: string
    branch?: string
  }): CashShift {
    // Si ya hay un turno abierto, devolverlo
    const current = this.getActiveShift()
    if (current) return current

    const newShift: CashShift = {
      id: `shift-${Date.now()}`,
      openedAt: new Date().toISOString(),
      openedBy: input.responsible || 'Cajero',
      initialCash: Math.max(0, Number(input.initialCash) || 0),
      branch: input.branch || 'Principal',
      cashSales: 0,
      qrSales: 0,
      mixedSales: 0,
      cashIn: 0,
      expenses: 0,
      cashReturns: 0,
      expectedCash: Math.max(0, Number(input.initialCash) || 0),
      status: 'open',
    }

    this.shifts.unshift(newShift)
    this.activeShiftId = newShift.id
    this.saveData()
    return newShift
  }

  addExpense(input: {
    amount: number
    motive: string
    responsible: string
  }): CashExpense {
    const shift = this.getActiveShift()
    const shiftId = shift ? shift.id : 'sin-turno'

    const expense: CashExpense = {
      id: `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shiftId,
      amount: Math.max(0, Number(input.amount) || 0),
      motive: input.motive.trim(),
      responsible: input.responsible || 'Cajero',
      timestamp: new Date().toISOString(),
    }

    this.expenses.unshift(expense)
    this.saveData()
    return expense
  }

  getExpensesForShift(shiftId: string): CashExpense[] {
    return this.expenses.filter((e) => e.shiftId === shiftId)
  }

  getAllExpenses(): CashExpense[] {
    return [...this.expenses]
  }

  /**
   * Calcula el resumen financiero del turno en tiempo real cruzando
   * con los pedidos reales del sistema (sin tocar la base de datos).
   */
  calculateShiftMetrics(shift: CashShift, orders: Order[]) {
    const shiftStart = new Date(shift.openedAt).getTime()
    const shiftEnd = shift.closedAt ? new Date(shift.closedAt).getTime() : Infinity

    // Pedidos pagados dentro del rango del turno
    const shiftOrders = orders.filter((o) => {
      if (o.status === 'cancelled') return false
      if (o.paymentStatus !== 'paid') return false
      const orderTime = new Date(o.createdAt).getTime()
      return orderTime >= shiftStart && orderTime <= shiftEnd
    })

    let cashSales = 0
    let qrSales = 0
    let mixedSales = 0

    shiftOrders.forEach((o) => {
      const p = o.payment
      if (!p) return

      if (p.method === 'cash') {
        cashSales += p.cashAmount > 0 ? p.cashAmount : o.total
      } else if (p.method === 'qr') {
        qrSales += p.qrAmount > 0 ? p.qrAmount : o.total
      } else if (p.method === 'mixed') {
        mixedSales += o.total
        cashSales += p.cashAmount || 0
        qrSales += p.qrAmount || 0
      }
    })

    const shiftExpenses = this.getExpensesForShift(shift.id)
    const totalExpenses = shiftExpenses.reduce((sum, e) => sum + e.amount, 0)

    // Formula obligatoria:
    // Efectivo esperado = Apertura + Ventas en efectivo + Entradas de efectivo - Gastos y salidas - Devoluciones en efectivo
    const expectedCash =
      shift.initialCash + cashSales + shift.cashIn - totalExpenses - shift.cashReturns

    return {
      orderCount: shiftOrders.length,
      cashSales: Math.round(cashSales * 100) / 100,
      qrSales: Math.round(qrSales * 100) / 100,
      mixedSales: Math.round(mixedSales * 100) / 100,
      totalSales: Math.round((cashSales + qrSales) * 100) / 100,
      expenses: Math.round(totalExpenses * 100) / 100,
      expectedCash: Math.round(expectedCash * 100) / 100,
      shiftOrders,
      shiftExpenses,
    }
  }

  /**
   * Cierre de caja definitivo e inalterable
   */
  closeShift(input: {
    shiftId: string
    actualCash: number
    responsible: string
    notes?: string
    orders: Order[]
  }): CashShift {
    const shiftIndex = this.shifts.findIndex((s) => s.id === input.shiftId)
    if (shiftIndex < 0) {
      throw new Error('No se encontró el turno de caja especificado.')
    }

    const shift = this.shifts[shiftIndex]
    if (shift.status === 'closed') {
      throw new Error('Este turno ya ha sido cerrado previamente.')
    }

    const metrics = this.calculateShiftMetrics(shift, input.orders)
    const countedCash = Math.max(0, Number(input.actualCash) || 0)
    const difference = Math.round((countedCash - metrics.expectedCash) * 100) / 100

    const closedShift: CashShift = {
      ...shift,
      closedAt: new Date().toISOString(),
      closedBy: input.responsible || 'Cajero',
      cashSales: metrics.cashSales,
      qrSales: metrics.qrSales,
      mixedSales: metrics.mixedSales,
      expenses: metrics.expenses,
      expectedCash: metrics.expectedCash,
      actualCash: countedCash,
      difference,
      notes: input.notes?.trim() || '',
      status: 'closed',
    }

    this.shifts[shiftIndex] = closedShift
    if (this.activeShiftId === input.shiftId) {
      this.activeShiftId = null
    }

    this.saveData()
    return closedShift
  }

  getShiftHistory(): CashShift[] {
    return [...this.shifts]
  }
}

export const barsCashService = new BarsCashService()

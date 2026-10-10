import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseContext } from '../../lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { CashExpense, CashShift, Order } from '../../types'

const SHIFTS_KEY = 'bars:cash_shifts'
const EXPENSES_KEY = 'bars:cash_expenses'
const ACTIVE_SHIFT_ID_KEY = 'bars:active_shift_id'

class BarsCashService {
  private shifts: CashShift[] = []
  private expenses: CashExpense[] = []
  private activeShiftId: string | null = null
  private listeners: Array<() => void> = []
  private unsubscribers: Unsubscribe[] = []
  private syncInitialized = false
  private authUnsubscribe: Unsubscribe | null = null

  constructor() {
    this.loadLocalData()
    if (typeof window !== 'undefined') {
      void getFirebaseContext().then((context) => {
        if (!context) return
        this.authUnsubscribe = onAuthStateChanged(context.auth, (user) => {
          this.stopFirestoreSync()
          if (user) void this.initFirestoreSync()
        })
      })
    }
  }

  private loadLocalData() {
    try {
      const rawShifts = localStorage.getItem(SHIFTS_KEY)
      this.shifts = rawShifts ? JSON.parse(rawShifts) : []

      const rawExpenses = localStorage.getItem(EXPENSES_KEY)
      this.expenses = rawExpenses ? JSON.parse(rawExpenses) : []

      this.activeShiftId = localStorage.getItem(ACTIVE_SHIFT_ID_KEY) || null

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

  private async initFirestoreSync() {
    if (this.syncInitialized || typeof window === 'undefined') return
    try {
      const context = await getFirebaseContext()
      if (!context) return
      this.syncInitialized = true

      // 1. Sincronizar turnos de caja en tiempo real
      const shiftsRef = collection(context.db, 'restaurants', context.restaurantId, 'cash_shifts')
      const shiftsQuery = query(shiftsRef, orderBy('openedAt', 'desc'), limit(100))
      const unsubShifts = onSnapshot(shiftsQuery, (snapshot) => {
        const list = snapshot.docs.map((docSnap) => docSnap.data() as CashShift)
        this.shifts = list

        const openShift = list.find((shift) => shift.status === 'open')
        this.activeShiftId = openShift ? openShift.id : null
        this.saveLocalData()
        this.notify()
      }, (err) => {
        console.warn('Cash shifts firestore sync notice:', err.message)
      })
      this.unsubscribers.push(unsubShifts)

      // 2. Sincronizar gastos de caja en tiempo real
      const expensesRef = collection(context.db, 'restaurants', context.restaurantId, 'cash_expenses')
      const expensesQuery = query(expensesRef, orderBy('timestamp', 'desc'), limit(200))
      const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
        this.expenses = snapshot.docs.map((docSnap) => docSnap.data() as CashExpense)
        this.saveLocalData()
        this.notify()
      }, (err) => {
        console.warn('Cash expenses firestore sync notice:', err.message)
      })
      this.unsubscribers.push(unsubExpenses)
    } catch (e) {
      console.warn('Failed to initialize Firestore cash sync:', e)
    }
  }

  private stopFirestoreSync() {
    this.unsubscribers.forEach((unsub) => unsub())
    this.unsubscribers = []
    this.syncInitialized = false
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

  private saveLocalData() {
    try {
      localStorage.setItem(SHIFTS_KEY, JSON.stringify(this.shifts))
      localStorage.setItem(EXPENSES_KEY, JSON.stringify(this.expenses))
      if (this.activeShiftId) {
        localStorage.setItem(ACTIVE_SHIFT_ID_KEY, this.activeShiftId)
      } else {
        localStorage.removeItem(ACTIVE_SHIFT_ID_KEY)
      }
    } catch (e) {
      console.error('Error saving cash data locally:', e)
    }
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
    this.saveLocalData()
    this.notify()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'cash_shifts', newShift.id), newShift)
        }
      } catch {}
    })()

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
    this.saveLocalData()
    this.notify()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'cash_expenses', expense.id), expense)
        }
      } catch {}
    })()

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

    this.saveLocalData()
    this.notify()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'cash_shifts', closedShift.id), closedShift)
        }
      } catch {}
    })()

    return closedShift
  }

  getShiftHistory(): CashShift[] {
    return [...this.shifts]
  }

  destroy() {
    this.authUnsubscribe?.()
    this.authUnsubscribe = null
    this.stopFirestoreSync()
  }
}

export const barsCashService = new BarsCashService()

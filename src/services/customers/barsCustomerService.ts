import { collection, deleteDoc, doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseContext } from '../../lib/firebase'
import type { BarsCustomer } from '../../types'

const STORAGE_KEY = 'bars:customers'

class BarsCustomerService {
  private customers: BarsCustomer[] = []
  private listeners = new Set<() => void>()
  private unsubscribe: Unsubscribe | null = null

  constructor() {
    try { this.customers = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { this.customers = [] }
    if (typeof window !== 'undefined') {
      void getFirebaseContext().then((context) => {
        if (!context) return
        onAuthStateChanged(context.auth, (user) => {
          this.unsubscribe?.()
          this.unsubscribe = null
          if (user) void this.startSync()
          else {
            this.customers = []
            this.saveLocal()
            this.notify()
          }
        })
      })
    }
  }

  private notify() { this.listeners.forEach(listener => listener()) }
  private saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customers)) }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getAll() { return [...this.customers] }
  async startSync() {
    const context = await getFirebaseContext()
    if (!context?.auth.currentUser || this.unsubscribe) return
    this.unsubscribe = onSnapshot(collection(context.db, 'restaurants', context.restaurantId, 'customers'), snapshot => {
      this.customers = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as BarsCustomer))
      this.saveLocal(); this.notify()
    }, (error) => {
      console.warn('BARS customers sync notice:', error.message)
      this.unsubscribe = null
    })
  }
  async save(input: Omit<BarsCustomer, 'id' | 'createdAt' | 'updatedAt'>, id?: string) {
    const now = new Date().toISOString()
    const existing = id ? this.customers.find(item => item.id === id) : undefined
    const customer: BarsCustomer = { ...input, id: id || `customer-${crypto.randomUUID()}`, createdAt: existing?.createdAt || now, updatedAt: now }
    this.customers = existing ? this.customers.map(item => item.id === id ? customer : item) : [...this.customers, customer]
    this.saveLocal(); this.notify()
    const context = await getFirebaseContext()
    if (context) await setDoc(doc(context.db, 'restaurants', context.restaurantId, 'customers', customer.id), customer)
    return customer
  }
  async archive(id: string) { const customer = this.customers.find(item => item.id === id); if (!customer) return; await this.save({ ...customer, active: false }, id) }
  async remove(id: string) {
    this.customers = this.customers.filter(item => item.id !== id); this.saveLocal(); this.notify()
    const context = await getFirebaseContext(); if (context) await deleteDoc(doc(context.db, 'restaurants', context.restaurantId, 'customers', id))
  }
}

export const barsCustomerService = new BarsCustomerService()

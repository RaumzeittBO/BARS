import {
  collection,
  deleteDoc,
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
import type { Order, ProductRecipe, RawMaterial, StockMovement, UnitOfMeasure } from '../../types'

const RAW_MATERIALS_KEY = 'bars:raw_materials'
const RECIPES_KEY = 'bars:product_recipes'
const MOVEMENTS_KEY = 'bars:stock_movements'
const DEDUCTED_ORDERS_KEY = 'bars:deducted_orders'

// El inventario real comienza vacío: una carta no indica existencias ni cantidades de receta.
const INITIAL_RAW_MATERIALS: RawMaterial[] = []

class BarsInventoryService {
  private materials: RawMaterial[] = []
  private recipes: Map<string, ProductRecipe> = new Map()
  private movements: StockMovement[] = []
  private deductedOrderIds: Set<string> = new Set()
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
      const rawMat = localStorage.getItem(RAW_MATERIALS_KEY)
      this.materials = rawMat ? JSON.parse(rawMat) : INITIAL_RAW_MATERIALS
      if (!rawMat) this.saveMaterialsLocal()

      const rawRec = localStorage.getItem(RECIPES_KEY)
      if (rawRec) {
        const list: ProductRecipe[] = JSON.parse(rawRec)
        list.forEach((r) => this.recipes.set(r.productId, r))
      }

      const rawMov = localStorage.getItem(MOVEMENTS_KEY)
      this.movements = rawMov ? JSON.parse(rawMov) : []

      const rawDed = localStorage.getItem(DEDUCTED_ORDERS_KEY)
      this.deductedOrderIds = rawDed ? new Set(JSON.parse(rawDed)) : new Set()
    } catch {
      this.materials = INITIAL_RAW_MATERIALS
      this.movements = []
      this.deductedOrderIds = new Set()
    }
  }

  private async initFirestoreSync() {
    if (this.syncInitialized || typeof window === 'undefined') return
    try {
      const context = await getFirebaseContext()
      if (!context) return
      this.syncInitialized = true

      // 1. Sincronizar insumos / materias primas
      const materialsRef = collection(context.db, 'restaurants', context.restaurantId, 'inventory_materials')
      const unsubMaterials = onSnapshot(materialsRef, (snapshot) => {
        this.materials = snapshot.docs.map((entry) => entry.data() as RawMaterial)
        this.saveMaterialsLocal()
        this.notify()
      }, (err) => {
        console.warn('Inventory materials firestore sync notice:', err.message)
      })
      this.unsubscribers.push(unsubMaterials)

      // 2. Sincronizar movimientos recientes
      const movementsRef = collection(context.db, 'restaurants', context.restaurantId, 'inventory_movements')
      const movementsQuery = query(movementsRef, orderBy('timestamp', 'desc'), limit(500))
      const unsubMovements = onSnapshot(movementsQuery, (snapshot) => {
        if (!snapshot.empty) {
          const list: StockMovement[] = []
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as StockMovement)
          })
          this.movements = list
          this.saveMovementsLocal()
          this.notify()
        }
      }, (err) => {
        console.warn('Inventory movements firestore sync notice:', err.message)
      })
      this.unsubscribers.push(unsubMovements)

      // 3. Sincronizar recetas
      const recipesRef = collection(context.db, 'restaurants', context.restaurantId, 'inventory_recipes')
      const unsubRecipes = onSnapshot(recipesRef, (snapshot) => {
        this.recipes = new Map(snapshot.docs.map((entry) => {
          const recipe = entry.data() as ProductRecipe
          return [recipe.productId, recipe]
        }))
        this.saveRecipesLocal()
        this.notify()
      }, (err) => {
        console.warn('Inventory recipes firestore sync notice:', err.message)
      })
      this.unsubscribers.push(unsubRecipes)

      // 4. Sincronizar pedidos deducidos (idempotencia multi-dispositivo)
      const deductionsRef = collection(context.db, 'restaurants', context.restaurantId, 'inventory_deductions')
      const unsubDeductions = onSnapshot(deductionsRef, (snapshot) => {
        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            this.deductedOrderIds.add(docSnap.id)
          })
          this.saveDeductedOrdersLocal()
        }
      }, (err) => {
        console.warn('Inventory deductions firestore sync notice:', err.message)
      })
      this.unsubscribers.push(unsubDeductions)
    } catch (e) {
      console.warn('Failed to initialize Firestore inventory sync:', e)
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

  private saveMaterialsLocal() {
    try {
      localStorage.setItem(RAW_MATERIALS_KEY, JSON.stringify(this.materials))
    } catch (e) {
      console.error('Error saving materials locally:', e)
    }
  }

  private saveRecipesLocal() {
    try {
      const list = Array.from(this.recipes.values())
      localStorage.setItem(RECIPES_KEY, JSON.stringify(list))
    } catch (e) {
      console.error('Error saving recipes locally:', e)
    }
  }

  private saveMovementsLocal() {
    try {
      const trimmed = this.movements.slice(0, 1000)
      localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(trimmed))
    } catch (e) {
      console.error('Error saving movements locally:', e)
    }
  }

  private saveDeductedOrdersLocal() {
    try {
      const array = Array.from(this.deductedOrderIds).slice(-1000)
      localStorage.setItem(DEDUCTED_ORDERS_KEY, JSON.stringify(array))
    } catch (e) {
      console.error('Error saving deducted orders locally:', e)
    }
  }

  getRawMaterials(): RawMaterial[] {
    return [...this.materials]
  }

  getRawMaterial(id: string): RawMaterial | undefined {
    return this.materials.find((m) => m.id === id)
  }

  saveRawMaterial(data: Omit<RawMaterial, 'id' | 'updatedAt'> & { id?: string }): RawMaterial {
    const existingIndex = this.materials.findIndex((m) => m.id === data.id)
    const now = new Date().toISOString()
    let saved: RawMaterial

    if (existingIndex >= 0) {
      saved = {
        ...this.materials[existingIndex],
        ...data,
        id: this.materials[existingIndex].id,
        updatedAt: now,
      }
      this.materials[existingIndex] = saved
    } else {
      saved = {
        ...data,
        id: data.id || `mat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        currentStock: Math.max(0, Number(data.currentStock) || 0),
        minStock: Math.max(0, Number(data.minStock) || 0),
        updatedAt: now,
      }
      this.materials.push(saved)
    }

    this.saveMaterialsLocal()
    this.notify()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_materials', saved.id), saved)
        }
      } catch {}
    })()

    return saved
  }

  deleteRawMaterial(id: string): boolean {
    const index = this.materials.findIndex((m) => m.id === id)
    if (index >= 0) {
      this.materials.splice(index, 1)
      this.saveMaterialsLocal()
      this.notify()

      void (async () => {
        if (typeof window === 'undefined') return
        try {
          const ctx = await getFirebaseContext()
          if (ctx) {
            await deleteDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_materials', id))
          }
        } catch {}
      })()

      return true
    }
    return false
  }

  registerMovement(
    materialId: string,
    type: StockMovement['type'],
    quantity: number,
    reason: string,
    createdBy: string = 'Sistema',
    orderId?: string
  ): StockMovement | null {
    const material = this.getRawMaterial(materialId)
    if (!material) return null

    const previousStock = material.currentStock
    let newStock = previousStock

    if (type === 'in') {
      newStock = previousStock + quantity
    } else if (type === 'out_sale' || type === 'waste') {
      newStock = Math.max(0, previousStock - quantity)
    } else if (type === 'adjustment') {
      newStock = quantity
    }

    material.currentStock = Math.round(newStock * 100) / 100
    material.updatedAt = new Date().toISOString()
    this.saveMaterialsLocal()

    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      rawMaterialId: materialId,
      rawMaterialName: material.name,
      type,
      quantity,
      previousStock,
      newStock: material.currentStock,
      reason,
      orderId,
      timestamp: new Date().toISOString(),
      createdBy,
    }

    this.movements.unshift(movement)
    this.saveMovementsLocal()
    this.notify()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await Promise.all([
            setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_movements', movement.id), movement),
            setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_materials', material.id), material),
          ])
        }
      } catch {}
    })()

    return movement
  }

  getMovements(): StockMovement[] {
    return [...this.movements]
  }

  getRecipes(): ProductRecipe[] {
    return Array.from(this.recipes.values())
  }

  getRecipe(productId: string): ProductRecipe | undefined {
    return this.recipes.get(productId)
  }

  saveRecipe(recipe: ProductRecipe) {
    this.recipes.set(recipe.productId, recipe)
    this.saveRecipesLocal()
    this.notify()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_recipes', recipe.productId), recipe)
        }
      } catch {}
    })()
  }

  getLowStockAlerts(): RawMaterial[] {
    return this.materials.filter((m) => m.currentStock <= m.minStock)
  }

  private convertRecipeQuantity(quantity: number, fromUnit: UnitOfMeasure | undefined, toUnit: UnitOfMeasure): number {
    if (!fromUnit || fromUnit === toUnit) return quantity
    if (fromUnit === 'g' && toUnit === 'kg') return quantity / 1000
    if (fromUnit === 'kg' && toUnit === 'g') return quantity * 1000
    if (fromUnit === 'ml' && toUnit === 'l') return quantity / 1000
    if (fromUnit === 'l' && toUnit === 'ml') return quantity * 1000
    return quantity
  }

  /**
   * Deduce el inventario automáticamente al confirmar una venta.
   * - Operación atómica e idempotente (un solo descuento por pedido).
   * - Descuenta ingredientes de recetas y extras compatibles.
   * - Considera modificadores opcionales (ej: 'Sin cebolla').
   */
  async deductStockForOrder(order: Order, userId: string = 'POS'): Promise<{
    success: boolean
    deductedCount: number
    details: { rawMaterialName: string; quantity: number }[]
  }> {
    if (this.deductedOrderIds.has(order.id)) {
      return { success: true, deductedCount: 0, details: [] }
    }

    const deductions: Map<string, { materialId: string; name: string; quantity: number }> = new Map()

    const addDeduction = (materialId: string, quantity: number) => {
      const mat = this.getRawMaterial(materialId)
      if (!mat) return
      const current = deductions.get(materialId) || { materialId, name: mat.name, quantity: 0 }
      current.quantity += quantity
      deductions.set(materialId, current)
    }

    for (const item of order.items) {
      const itemQty = item.quantity
      // `item.id` identifica la línea del pedido; la receta está indexada por el
      // producto del catálogo. Mantener el fallback permite leer pedidos antiguos.
      const recipe = this.getRecipe(item.productId || item.id)

      if (recipe && recipe.ingredients.length > 0) {
        for (const ing of recipe.ingredients) {
          if (ing.modifierOption) {
            const hasOptionExclusion = item.modifiers.options.some((opt) =>
              opt.toLowerCase().includes(ing.modifierOption!.toLowerCase())
            )
            if (hasOptionExclusion) continue
          }
          const material = this.getRawMaterial(ing.rawMaterialId)
          const quantityInStockUnit = material
            ? this.convertRecipeQuantity(ing.quantity, ing.unit, material.unit)
            : ing.quantity
          addDeduction(ing.rawMaterialId, quantityInStockUnit * itemQty)
        }
      }
    }

    const details: { rawMaterialName: string; quantity: number }[] = []
    for (const item of deductions.values()) {
      this.registerMovement(
        item.materialId,
        'out_sale',
        item.quantity,
        `Venta #${order.displayNumber}`,
        userId,
        order.id
      )
      details.push({ rawMaterialName: item.name, quantity: item.quantity })
    }

    this.deductedOrderIds.add(order.id)
    this.saveDeductedOrdersLocal()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await setDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_deductions', order.id), {
            orderId: order.id,
            deductedAt: new Date().toISOString(),
            details,
          })
        }
      } catch {}
    })()

    return {
      success: true,
      deductedCount: details.length,
      details,
    }
  }

  async restoreStockForOrder(order: Order, userId: string = 'POS'): Promise<boolean> {
    if (!this.deductedOrderIds.has(order.id)) {
      return false
    }

    const orderMovements = this.movements.filter((m) => m.orderId === order.id && m.type === 'out_sale')

    for (const mov of orderMovements) {
      this.registerMovement(
        mov.rawMaterialId,
        'in',
        mov.quantity,
        `Reversión / Devolución Pedido #${order.displayNumber}`,
        userId,
        order.id
      )
    }

    this.deductedOrderIds.delete(order.id)
    this.saveDeductedOrdersLocal()

    void (async () => {
      if (typeof window === 'undefined') return
      try {
        const ctx = await getFirebaseContext()
        if (ctx) {
          await deleteDoc(doc(ctx.db, 'restaurants', ctx.restaurantId, 'inventory_deductions', order.id))
        }
      } catch {}
    })()

    return true
  }

  destroy() {
    this.authUnsubscribe?.()
    this.authUnsubscribe = null
    this.stopFirestoreSync()
  }
}

export const barsInventoryService = new BarsInventoryService()

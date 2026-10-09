import type { Order, ProductRecipe, RawMaterial, StockMovement } from '../../types'

const RAW_MATERIALS_KEY = 'bars:raw_materials'
const RECIPES_KEY = 'bars:product_recipes'
const MOVEMENTS_KEY = 'bars:stock_movements'
const DEDUCTED_ORDERS_KEY = 'bars:deducted_orders'

const INITIAL_RAW_MATERIALS: RawMaterial[] = [
  { id: 'mat-1', name: 'Pan de Hamburguesa', unit: 'u', currentStock: 100, minStock: 25, costPerUnit: 1.5, category: 'Panadería', updatedAt: new Date().toISOString() },
  { id: 'mat-2', name: 'Medallón de Carne BARS (120g)', unit: 'u', currentStock: 90, minStock: 20, costPerUnit: 5.0, category: 'Carnes', updatedAt: new Date().toISOString() },
  { id: 'mat-3', name: 'Lámina de Queso Cheddar', unit: 'u', currentStock: 120, minStock: 30, costPerUnit: 1.2, category: 'Lácteos', updatedAt: new Date().toISOString() },
  { id: 'mat-4', name: 'Porción de Tocino Ahumado', unit: 'porcion', currentStock: 60, minStock: 15, costPerUnit: 2.0, category: 'Carnes', updatedAt: new Date().toISOString() },
  { id: 'mat-5', name: 'Salsa Especial BARS', unit: 'ml', currentStock: 3000, minStock: 500, costPerUnit: 0.05, category: 'Salsas', updatedAt: new Date().toISOString() },
  { id: 'mat-6', name: 'Cebolla Caramelizada', unit: 'porcion', currentStock: 50, minStock: 10, costPerUnit: 1.0, category: 'Verduras', updatedAt: new Date().toISOString() },
  { id: 'mat-7', name: 'Papas Bastón Prefritas', unit: 'porcion', currentStock: 80, minStock: 20, costPerUnit: 3.5, category: 'Guarniciones', updatedAt: new Date().toISOString() },
  { id: 'mat-8', name: 'Gaseosa 500ml', unit: 'u', currentStock: 48, minStock: 12, costPerUnit: 4.0, category: 'Bebidas', updatedAt: new Date().toISOString() },
]

class BarsInventoryService {
  private materials: RawMaterial[] = []
  private recipes: Map<string, ProductRecipe> = new Map()
  private movements: StockMovement[] = []
  private deductedOrderIds: Set<string> = new Set()
  private listeners: Array<() => void> = []

  constructor() {
    this.loadData()
  }

  private loadData() {
    try {
      const rawMat = localStorage.getItem(RAW_MATERIALS_KEY)
      this.materials = rawMat ? JSON.parse(rawMat) : INITIAL_RAW_MATERIALS
      if (!rawMat) this.saveMaterials()

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

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private saveMaterials() {
    try {
      localStorage.setItem(RAW_MATERIALS_KEY, JSON.stringify(this.materials))
    } catch (e) {
      console.error('Error saving materials:', e)
    }
    this.notify()
  }

  private saveRecipes() {
    try {
      const list = Array.from(this.recipes.values())
      localStorage.setItem(RECIPES_KEY, JSON.stringify(list))
    } catch (e) {
      console.error('Error saving recipes:', e)
    }
    this.notify()
  }

  private saveMovements() {
    try {
      // Limitar a los 1000 movimientos más recientes para rendimiento
      const trimmed = this.movements.slice(0, 1000)
      localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(trimmed))
    } catch (e) {
      console.error('Error saving movements:', e)
    }
    this.notify()
  }

  private saveDeductedOrders() {
    try {
      const array = Array.from(this.deductedOrderIds).slice(-1000)
      localStorage.setItem(DEDUCTED_ORDERS_KEY, JSON.stringify(array))
    } catch (e) {
      console.error('Error saving deducted orders:', e)
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

    this.saveMaterials()
    return saved
  }

  deleteRawMaterial(id: string): boolean {
    const index = this.materials.findIndex((m) => m.id === id)
    if (index >= 0) {
      this.materials.splice(index, 1)
      this.saveMaterials()
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
    this.saveMaterials()

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
    this.saveMovements()
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
    this.saveRecipes()
  }

  getLowStockAlerts(): RawMaterial[] {
    return this.materials.filter((m) => m.currentStock <= m.minStock)
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
    // Protección contra doble descuento
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
      const recipe = this.getRecipe(item.id) // O por ID de producto

      if (recipe && recipe.ingredients.length > 0) {
        // Usar receta configurada explícitamente
        for (const ing of recipe.ingredients) {
          // Si el modificador excluye este ingrediente (ej: "Sin cebolla")
          if (ing.modifierOption) {
            const hasOptionExclusion = item.modifiers.options.some((opt) =>
              opt.toLowerCase().includes(ing.modifierOption!.toLowerCase())
            )
            if (hasOptionExclusion) continue
          }
          addDeduction(ing.rawMaterialId, ing.quantity * itemQty)
        }
      } else {
        // Fallback inteligente para hamburguesas y combos por convención de nombre
        const lowerName = item.name.toLowerCase()
        const isBurger = lowerName.includes('hamburguesa') || lowerName.includes('burger') || lowerName.includes('clasica') || lowerName.includes('bacon')

        if (isBurger) {
          // Pan
          const pan = this.materials.find((m) => m.name.toLowerCase().includes('pan'))
          if (pan) addDeduction(pan.id, 1 * itemQty)

          // Carne (detecta doble/triple/cuadruple)
          const carne = this.materials.find((m) => m.name.toLowerCase().includes('carne'))
          if (carne) {
            let numCarnes = 1
            if (lowerName.includes('cuadruple')) numCarnes = 4
            else if (lowerName.includes('triple')) numCarnes = 3
            else if (lowerName.includes('doble') || lowerName.includes('double')) numCarnes = 2
            addDeduction(carne.id, numCarnes * itemQty)
          }

          // Queso
          const queso = this.materials.find((m) => m.name.toLowerCase().includes('queso'))
          if (queso) addDeduction(queso.id, 1 * itemQty)

          // Cebolla si no dice "Sin cebolla"
          const sinCebolla = item.modifiers.options.some((opt) => opt.toLowerCase().includes('sin cebolla'))
          const cebolla = this.materials.find((m) => m.name.toLowerCase().includes('cebolla'))
          if (cebolla && !sinCebolla) addDeduction(cebolla.id, 1 * itemQty)
        }

        // Papas
        if (lowerName.includes('papa') || lowerName.includes('combo')) {
          const papas = this.materials.find((m) => m.name.toLowerCase().includes('papa'))
          if (papas) addDeduction(papas.id, 1 * itemQty)
        }

        // Bebida
        if (lowerName.includes('soda') || lowerName.includes('gaseosa') || lowerName.includes('coca') || lowerName.includes('combo')) {
          const bebida = this.materials.find((m) => m.name.toLowerCase().includes('gaseosa'))
          if (bebida) addDeduction(bebida.id, 1 * itemQty)
        }
      }

      // Descuento por extras agregados (ej: 'Carne extra', 'Queso extra', 'Tocino')
      if (item.modifiers.extras && item.modifiers.extras.length > 0) {
        for (const extra of item.modifiers.extras) {
          const extraLower = extra.name.toLowerCase()
          if (extraLower.includes('carne')) {
            const carne = this.materials.find((m) => m.name.toLowerCase().includes('carne'))
            if (carne) addDeduction(carne.id, 1 * itemQty)
          } else if (extraLower.includes('queso')) {
            const queso = this.materials.find((m) => m.name.toLowerCase().includes('queso'))
            if (queso) addDeduction(queso.id, 1 * itemQty)
          } else if (extraLower.includes('tocino') || extraLower.includes('bacon')) {
            const tocino = this.materials.find((m) => m.name.toLowerCase().includes('tocino'))
            if (tocino) addDeduction(tocino.id, 1 * itemQty)
          }
        }
      }
    }

    // Aplicar deducciones
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

    // Marcar pedido como deducido
    this.deductedOrderIds.add(order.id)
    this.saveDeductedOrders()

    return {
      success: true,
      deductedCount: details.length,
      details,
    }
  }

  /**
   * Reversión de inventario en caso de cancelación o devolución de venta
   */
  async restoreStockForOrder(order: Order, userId: string = 'POS'): Promise<boolean> {
    if (!this.deductedOrderIds.has(order.id)) {
      return false // No se había descontado nada
    }

    // Buscar movimientos previos de esta venta y revertirlos
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
    this.saveDeductedOrders()
    return true
  }
}

export const barsInventoryService = new BarsInventoryService()

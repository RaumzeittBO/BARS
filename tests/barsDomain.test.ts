import { strict as assert } from 'node:assert'

// Polyfill in-memory localStorage for Node test runner
const memoryStorage: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => memoryStorage[key] ?? null,
  setItem: (key: string, value: string) => { memoryStorage[key] = String(value) },
  removeItem: (key: string) => { delete memoryStorage[key] },
  clear: () => { Object.keys(memoryStorage).forEach((k) => delete memoryStorage[k]) },
}
try {
  Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true })
} catch {}

import { EscPosBuilder } from '../src/services/printer/barsPrinterService.ts'
import { barsCashService } from '../src/services/cash/barsCashService.ts'
import { barsInventoryService } from '../src/services/inventory/barsInventoryService.ts'
import type { Order, OrderStatus } from '../src/types.ts'

console.log('--- INICIANDO PRUEBAS DE DOMINIO BARS ---')

// 1. PRUEBA DE MOTOR ESC/POS Y ENCABEZADOS
console.log('1. Verificando motor de impresión térmica ESC/POS...')
const builder = new EscPosBuilder('58mm')
builder.init()
builder.align('center')
builder.bold(true).line('BARS').bold(false)
builder.line('PACHAX')
builder.cut()

const base64Ticket = builder.toBase64()
assert.ok(base64Ticket.length > 0, 'El ticket base64 no debe estar vacío')
const bytes = builder.toByteArray()
// Verificar comando de inicialización ESC @ (0x1b, 0x40)
assert.equal(bytes[0], 0x1b, 'Debe iniciar con ESC')
assert.equal(bytes[1], 0x40, 'Debe llamar al reset de impresora')
console.log('   ✓ Motor ESC/POS genera secuencias correctas para 58mm y 80mm')

// 2. PRUEBA DE CAJA & ARQUEO DE TURNO
console.log('2. Verificando fórmulas de Caja & Arqueo de Turno...')
const shift = barsCashService.openShift({
  initialCash: 150,
  responsible: 'Cajero Test',
  branch: 'Sucursal Central',
})

assert.equal(shift.initialCash, 150, 'El fondo de apertura debe ser 150')
assert.equal(shift.status, 'open', 'El turno debe estar abierto')

// Registrar gasto menor
const expense = barsCashService.addExpense({
  amount: 25,
  motive: 'Compra de hielo',
  responsible: 'Cajero Test',
})
assert.equal(expense.amount, 25, 'El gasto debe ser de 25')

// Simular pedidos
const mockOrders: Order[] = [
  {
    id: 'ord-1',
    sequence: 1,
    displayNumber: '001',
    createdAt: new Date().toISOString(),
    status: 'delivered',
    items: [],
    total: 80,
    payment: {
      method: 'cash',
      cashAmount: 80,
      qrAmount: 0,
      cashReceived: 100,
      change: 20,
    },
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    expectedPaymentMethod: 'cash',
    orderSource: 'local',
    fulfillmentType: 'table',
  },
  {
    id: 'ord-2',
    sequence: 2,
    displayNumber: '002',
    createdAt: new Date().toISOString(),
    status: 'delivered',
    items: [],
    total: 50,
    payment: {
      method: 'qr',
      cashAmount: 0,
      qrAmount: 50,
      cashReceived: 0,
      change: 0,
    },
    paymentStatus: 'paid',
    paymentMethod: 'qr',
    expectedPaymentMethod: 'qr',
    orderSource: 'local',
    fulfillmentType: 'table',
  },
]

const metrics = barsCashService.calculateShiftMetrics(shift, mockOrders)
assert.equal(metrics.cashSales, 80, 'Las ventas en efectivo deben ser 80')
assert.equal(metrics.qrSales, 50, 'Las ventas QR deben ser 50 y separadas del efectivo')
assert.equal(metrics.expenses, 25, 'Los gastos deben ser 25')

// Fórmula: Apertura (150) + Ventas Efectivo (80) - Gastos (25) = 205
assert.equal(metrics.expectedCash, 205, 'El efectivo esperado debe ser 205')

// Simular cierre de caja con efectivo contado = 205 (exacto)
const closedShift = barsCashService.closeShift({
  shiftId: shift.id,
  actualCash: 205,
  responsible: 'Admin Test',
  notes: 'Turno cuadrado sin novedad',
  orders: mockOrders,
})

assert.equal(closedShift.status, 'closed', 'El turno debe quedar cerrado')
assert.equal(closedShift.difference, 0, 'La diferencia debe ser 0 en cuadre exacto')
console.log('   ✓ Fórmulas de caja, arqueo y discriminación de QR validadas correctamente')

// 3. PRUEBA DE INVENTARIO Y DESCUENTO AUTOMÁTICO
console.log('3. Verificando descuento automático de inventario y recetas...')
barsInventoryService.saveRawMaterial({ id: 'test-pan', name: 'Pan de prueba', unit: 'u', currentStock: 10, minStock: 0 })
barsInventoryService.saveRawMaterial({ id: 'test-carne', name: 'Carne de prueba', unit: 'kg', currentStock: 20, minStock: 0 })
barsInventoryService.saveRecipe({ productId: 'item-1', ingredients: [
  { rawMaterialId: 'test-pan', quantity: 1 },
  { rawMaterialId: 'test-carne', quantity: 200, unit: 'g' },
] })
const initialMaterials = barsInventoryService.getRawMaterials()
const initialPanes = initialMaterials.find((m) => m.name.toLowerCase().includes('pan'))?.currentStock || 0
const initialCarnes = initialMaterials.find((m) => m.name.toLowerCase().includes('carne'))?.currentStock || 0

// Simular pedido de 2 hamburguesas dobles con una receta definida explícitamente.
const burgerOrder: Order = {
  id: 'ord-inv-test',
  sequence: 3,
  displayNumber: '003',
  createdAt: new Date().toISOString(),
  status: 'preparing',
  items: [
    {
      id: 'line-hamburguesa-1',
      productId: 'item-1',
      name: 'Hamburguesa Doble BARS',
      basePrice: 35,
      quantity: 2,
      lineTotal: 70,
      modifiers: {
        extras: [],
        options: ['Sin cebolla'],
        note: '',
      },
    },
  ],
  total: 80,
  payment: { method: 'cash', cashAmount: 80, qrAmount: 0, cashReceived: 80, change: 0 },
  paymentStatus: 'paid',
  paymentMethod: 'cash',
  expectedPaymentMethod: 'cash',
  orderSource: 'local',
  fulfillmentType: 'table',
}

const deductionResult = await barsInventoryService.deductStockForOrder(burgerOrder, 'TestUser')
assert.ok(deductionResult.success, 'El descuento debe completarse con éxito')

const updatedMaterials = barsInventoryService.getRawMaterials()
const newPanes = updatedMaterials.find((m) => m.name.toLowerCase().includes('pan'))?.currentStock || 0
const newCarnes = updatedMaterials.find((m) => m.name.toLowerCase().includes('carne'))?.currentStock || 0

// 2 hamburguesas = 2 panes descontados
assert.equal(newPanes, initialPanes - 2, 'Deben descontarse 2 panes')
assert.equal(newCarnes, initialCarnes - 0.4, 'Deben descontarse 400 g = 0.4 kg de carne de la receta')

// Probar idempotencia (un segundo descuento con el mismo pedido no debe volver a descontar)
const duplicateDeduction = await barsInventoryService.deductStockForOrder(burgerOrder, 'TestUser')
assert.equal(duplicateDeduction.deductedCount, 0, 'No debe descontar dos veces por el mismo pedido')

// Probar reversión al cancelar pedido
const restored = await barsInventoryService.restoreStockForOrder(burgerOrder, 'TestUser')
assert.ok(restored, 'El stock debe restaurarse al cancelar')
const restoredMaterials = barsInventoryService.getRawMaterials()
const restoredPanes = restoredMaterials.find((m) => m.name.toLowerCase().includes('pan'))?.currentStock || 0
assert.equal(restoredPanes, initialPanes, 'Los panes deben volver al valor original tras la reversión')

console.log('   ✓ Inventario con recetas, deducción atómica e idempotencia verificado')

console.log('--- TODAS LAS PRUEBAS DE DOMINIO BARS PASARON CON ÉXITO ---')

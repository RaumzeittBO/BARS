import assert from 'node:assert/strict'
import {
  aggregateProductSales,
  calculateInventoryUsage,
  filterOrdersBySource,
  getOrderProductTotal,
  isOrderDateInRange,
} from './src/lib/orderReports.ts'

const baseOrder = {
  id: '1', sequence: 1, displayNumber: '#001', createdAt: new Date().toISOString(), status: 'delivered',
  total: 0, payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cashReceived: 0, change: 0 },
  paymentStatus: 'pending', paymentMethod: null, expectedPaymentMethod: null,
  orderSource: 'local', fulfillmentType: 'pickup', items: [],
}

const orders = [{
  ...baseOrder,
  items: [
    { id: 'simple', name: 'Burger Lab Simple Con Papas', basePrice: 22, quantity: 3, lineTotal: 66, modifiers: { extras: [], options: [], note: '' } },
    { id: 'double', name: 'BBQ DOBLE Con Papas', basePrice: 38, quantity: 2, lineTotal: 106, modifiers: { extras: [{ id: 'carne', name: 'Carne extra', price: 15 }], options: [], note: '' } },
  ],
}, {
  ...baseOrder,
  id: 'gift', paymentStatus: 'gift',
  items: [{ id: 'gift-item', name: 'Burger Lab Simple Sin Papas', basePrice: 19, quantity: 1, lineTotal: 21, modifiers: { extras: [{ id: 'pina', name: 'Pina', price: 2 }], options: [], note: '' } }],
}]

assert.deepEqual(calculateInventoryUsage(orders), { panes: 6, carnes: 10 })
const sales = aggregateProductSales(orders)
assert.deepEqual(sales.find((row) => row.name === 'Burger Lab Simple Con Papas'), { name: 'Burger Lab Simple Con Papas', type: 'Producto', quantity: 3, revenue: 66 })
assert.equal(sales.find((row) => row.name === 'Carne extra')?.quantity, 2)
assert.equal(sales.find((row) => row.name === 'Pina')?.revenue, 0)

const exactBbqOrder = {
  ...baseOrder,
  id: 'exact-bbq',
  items: [{ id: 'bbq', name: 'BBQ', basePrice: 23, quantity: 4, lineTotal: 92, modifiers: { extras: [], options: [], note: '' } }],
}
assert.deepEqual(calculateInventoryUsage([exactBbqOrder]), { panes: 4, carnes: 4 })

const editedOrderWithStaleSubtotal = {
  ...baseOrder,
  id: 'edited',
  total: 28,
  productSubtotal: 22,
  items: [
    { id: 'burger', name: 'Burger Lab', basePrice: 22, quantity: 1, lineTotal: 22, modifiers: { extras: [], options: [], note: '' } },
    { id: 'fries', name: 'Porcion de Papas', basePrice: 6, quantity: 1, lineTotal: 6, modifiers: { extras: [], options: [], note: '' } },
  ],
}
assert.equal(getOrderProductTotal(editedOrderWithStaleSubtotal), 28)
assert.equal(aggregateProductSales([editedOrderWithStaleSubtotal]).reduce((sum, row) => sum + row.revenue, 0), 28)

const renamedCatalogOrders = [{
  ...baseOrder,
  id: 'old-name',
  createdAt: '2026-08-03T20:00:00-04:00',
  items: [{ id: 'old', name: 'Burger Lab Simple Con Papas', basePrice: 22, quantity: 2, lineTotal: 44, modifiers: { extras: [], options: [], note: '' } }],
}, {
  ...baseOrder,
  id: 'new-name',
  createdAt: '2026-08-04T20:00:00-04:00',
  items: [{ id: 'new', name: 'Burger Lab', basePrice: 22, quantity: 1, lineTotal: 22, modifiers: { extras: [], options: [], note: '' } }],
}]
const renamedSales = aggregateProductSales(renamedCatalogOrders.reverse())
assert.deepEqual(renamedSales.filter((row) => row.type === 'Producto'), [
  { name: 'Burger Lab', type: 'Producto', quantity: 3, revenue: 66 },
])

assert.equal(isOrderDateInRange('2026-07-31T23:00:00-04:00', '2026-08-03', 'week'), true)
assert.equal(isOrderDateInRange('2026-07-31T23:00:00-04:00', '2026-08-03', 'month'), true)
assert.equal(isOrderDateInRange('2026-07-04T23:00:00-04:00', '2026-08-03', 'month'), false)

const localTable = { ...baseOrder, id: 'local-table', orderSource: 'local', fulfillmentType: 'table' }
const localPickup = { ...baseOrder, id: 'local-pickup', orderSource: 'local', fulfillmentType: 'pickup' }
const whatsappDelivery = { ...baseOrder, id: 'whatsapp', orderSource: 'whatsapp', fulfillmentType: 'delivery' }
assert.deepEqual(filterOrdersBySource([localTable, localPickup, whatsappDelivery], 'local').map((order) => order.id), ['local-table', 'local-pickup'])
assert.deepEqual(filterOrdersBySource([localTable, localPickup, whatsappDelivery], 'whatsapp').map((order) => order.id), ['whatsapp'])

console.log('PASS: rangos, origenes, panes, carnes, ediciones y productos vendidos correctos.')

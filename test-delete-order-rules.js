import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import fs from 'fs'

const projectId = 'comandero-delete-order-test'
const restaurantId = 'principal'
const dayId = '2026-08-01'

function order(id, status) {
  return {
    id,
    sequence: 1,
    displayNumber: '#001',
    createdAt: new Date(),
    updatedAt: new Date(),
    status,
    items: [{ id: 'item-1', name: 'Burger', quantity: 1, lineTotal: 22, modifiers: { extras: [], options: [], note: '' } }],
    total: 22,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: 22, qrAmount: 0, cashReceived: 22, change: 0 },
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: '1',
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    createdBy: 'uid-caja',
  }
}

function deletedFields() {
  return {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    cancelledBy: 'Caja',
    cancelledReason: 'Eliminado desde el sistema',
    updatedAt: serverTimestamp(),
  }
}

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firebase/firestore.rules', 'utf8'),
    },
  })

  try {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `restaurants/${restaurantId}/members/uid-caja`), { email: 'caja@dev.local', role: 'caja', active: true })
      await setDoc(doc(db, `restaurants/${restaurantId}/members/uid-cocina`), { email: 'cocina@dev.local', role: 'cocina', active: true })
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/active-order`), order('active-order', 'preparing'))
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/delivered-order`), order('delivered-order', 'delivered'))
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/kitchen-order`), order('kitchen-order', 'preparing'))
    })

    const dbCaja = testEnv.authenticatedContext('uid-caja').firestore()
    const activeRef = doc(dbCaja, `restaurants/${restaurantId}/days/${dayId}/orders/active-order`)
    const deliveredRef = doc(dbCaja, `restaurants/${restaurantId}/days/${dayId}/orders/delivered-order`)

    await assertSucceeds(updateDoc(activeRef, deletedFields()))
    await assertSucceeds(updateDoc(deliveredRef, deletedFields()))
    await assertFails(deleteDoc(deliveredRef))

    const saved = await getDoc(deliveredRef)
    if (!saved.exists() || saved.data()?.status !== 'cancelled') {
      throw new Error('El pedido eliminado no quedo conservado en el historial.')
    }

    const dbCocina = testEnv.authenticatedContext('uid-cocina').firestore()
    const kitchenRef = doc(dbCocina, `restaurants/${restaurantId}/days/${dayId}/orders/kitchen-order`)
    await assertFails(updateDoc(kitchenRef, deletedFields()))

    console.log('PASS: Caja conserva eliminados activos y entregados; cocina y deleteDoc quedan bloqueados.')
  } finally {
    await testEnv.cleanup()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

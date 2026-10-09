import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import fs from 'fs'

const projectId = 'comandero-operator-role-test'
const restaurantId = 'principal'
const dayId = '2026-08-01'

function order() {
  return {
    id: 'operator-order',
    sequence: 1,
    displayNumber: '#001',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'preparing',
    estimatedDelay: 10,
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
    createdBy: 'uid-operador',
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
      await setDoc(doc(db, `restaurants/${restaurantId}/members/uid-operador`), {
        uid: 'uid-operador',
        email: 'operador@dev.local',
        displayName: 'Operador',
        role: 'operador',
        active: true,
        createdAt: new Date(),
      })
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/operator-order`), order())
    })

    const db = testEnv.authenticatedContext('uid-operador').firestore()
    await assertSucceeds(getDocs(collection(db, `restaurants/${restaurantId}/members`)))
    await assertSucceeds(setDoc(doc(db, `restaurants/${restaurantId}/members/uid-caja`), {
      uid: 'uid-caja',
      email: 'caja@dev.local',
      displayName: 'Caja',
      role: 'caja',
      active: true,
      createdAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(db, `restaurants/${restaurantId}/catalog/main/categories/operator-category`), {
      name: 'Prueba operador',
      subtitle: '',
      emoji: 'TAG',
      sortOrder: 1,
      isActive: true,
      isVisible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/operator-order`), {
      status: 'ready',
      readyAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))

    console.log('PASS: operador administra usuarios/catalogo y opera pedidos.')
  } finally {
    await testEnv.cleanup()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

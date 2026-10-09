import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'fs';

const projectId = 'comandero-edit-order-test';
const restaurantId = 'principal';
const dayId = '2026-07-31';

function order(id, status, paymentStatus = 'paid') {
  const isPaid = paymentStatus === 'paid';
  return {
    id,
    sequence: 1,
    displayNumber: '#001',
    createdAt: new Date(),
    updatedAt: new Date(),
    status,
    estimatedDelay: 10,
    items: [{ id: 'item-1', name: 'Burger', quantity: 1, lineTotal: 22, modifiers: { extras: [], options: [], note: '' } }],
    total: 22,
    paymentStatus,
    paymentMethod: isPaid ? 'cash' : null,
    expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: isPaid ? 22 : 0, qrAmount: 0, cashReceived: isPaid ? 22 : 0, change: 0 },
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: '1',
    customerName: '',
    customerPhone: '',
    whatsappChatId: '',
    deliveryAddress: '',
    suppressWhatsappDispatchNotice: false,
    forceWhatsappDispatchNotice: false,
    createdBy: 'uid-caja',
  };
}

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firebase/firestore.rules', 'utf8'),
    },
  });

  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `restaurants/${restaurantId}/members/uid-caja`), {
        email: 'caja@dev.local',
        role: 'caja',
        active: true,
      });
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/preparing-order`), order('preparing-order', 'preparing'));
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/ready-order`), order('ready-order', 'ready'));
      await setDoc(doc(db, `restaurants/${restaurantId}/days/${dayId}/orders/gift-order`), order('gift-order', 'preparing', 'gift'));
    });

    const dbCaja = testEnv.authenticatedContext('uid-caja').firestore();
    const preparingRef = doc(dbCaja, `restaurants/${restaurantId}/days/${dayId}/orders/preparing-order`);
    const editToQr = {
      items: [{ id: 'item-1', name: 'Burger', quantity: 1, lineTotal: 22, modifiers: { extras: [], options: [], note: '' } }],
      total: 22,
      paymentStatus: 'paid',
      paymentMethod: 'qr',
      expectedPaymentMethod: null,
      payment: { method: 'qr', cashAmount: 0, qrAmount: 22, cashReceived: 0, change: 0 },
      fulfillmentType: 'table',
      tableInfo: '1',
      customerName: '',
      customerPhone: '',
      whatsappChatId: '',
      deliveryAddress: '',
      suppressWhatsappDispatchNotice: false,
      forceWhatsappDispatchNotice: false,
      updatedAt: serverTimestamp(),
    };

    await assertSucceeds(updateDoc(preparingRef, editToQr));
    const saved = (await getDoc(preparingRef)).data();
    if (saved?.paymentMethod !== 'qr' || saved?.payment?.method !== 'qr' || saved?.payment?.qrAmount !== 22) {
      throw new Error('El cambio de efectivo a QR no se guardo correctamente.');
    }

    const readyRef = doc(dbCaja, `restaurants/${restaurantId}/days/${dayId}/orders/ready-order`);
    await assertSucceeds(updateDoc(readyRef, editToQr));
    await assertFails(updateDoc(preparingRef, { sequence: 999, updatedAt: serverTimestamp() }));

    await assertSucceeds(updateDoc(preparingRef, {
      ...editToQr,
      orderSource: 'whatsapp',
      fulfillmentType: 'pickup',
      tableInfo: '',
      customerName: 'Cliente corregido',
      customerPhone: '70000000',
      whatsappChatId: '59170000000@s.whatsapp.net',
    }));
    const correctedSource = (await getDoc(preparingRef)).data();
    if (correctedSource?.orderSource !== 'whatsapp' || correctedSource?.fulfillmentType !== 'pickup' || correctedSource?.whatsappChatId !== '59170000000@s.whatsapp.net') {
      throw new Error('El cambio de pedido local a WhatsApp no guardo correctamente el chat enlazado.');
    }

    const giftRef = doc(dbCaja, `restaurants/${restaurantId}/days/${dayId}/orders/gift-order`);
    await assertSucceeds(updateDoc(giftRef, {
      ...editToQr,
      paymentMethod: 'cash',
      payment: { method: 'cash', cashAmount: 22, qrAmount: 0, cashReceived: 22, change: 0 },
    }));
    const correctedGift = (await getDoc(giftRef)).data();
    if (correctedGift?.paymentStatus !== 'paid' || correctedGift?.paymentMethod !== 'cash' || correctedGift?.payment?.cashAmount !== 22) {
      throw new Error('El cambio de regalo a efectivo no se guardo correctamente.');
    }

    await assertSucceeds(updateDoc(readyRef, {
      ...editToQr,
      paymentStatus: 'gift',
      paymentMethod: null,
      payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cashReceived: 0, change: 0 },
    }));
    console.log('PASS: regalo, metodo, origen y modalidad se corrigen; los campos protegidos siguen bloqueados.');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

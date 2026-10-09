import {
  ticketClienteBase64,
  ticketCocinaBase64,
  ticketsCajaBase64,
} from './src/lib/escpos.ts'

const CUT = [0x1d, 0x56, 0x42, 0x00]
const LF = 0x0a

function buildOrder(overrides = {}) {
  return {
    id: 'ticket-test',
    sequence: 1,
    displayNumber: '#001',
    createdAt: '2026-08-01T20:00:00.000Z',
    status: 'preparing',
    estimatedDelay: 10,
    items: [{
      id: 'item-1',
      name: 'Burger Lab Simple Con Papas',
      quantity: 1,
      lineTotal: 22,
      modifiers: { extras: [], options: [], note: '' },
    }],
    total: 22,
    payment: { method: 'cash', cashAmount: 22, qrAmount: 0, cashReceived: 22, change: 0 },
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    expectedPaymentMethod: null,
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: '4',
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    createdBy: 'test',
    ...overrides,
  }
}

function bytes(base64) {
  return Buffer.from(base64, 'base64')
}

function countSequence(buffer, sequence) {
  let count = 0
  for (let index = 0; index <= buffer.length - sequence.length; index += 1) {
    if (sequence.every((value, offset) => buffer[index + offset] === value)) count += 1
  }
  return count
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertHeadingSharesLine(buffer, title, number) {
  const titleIndex = buffer.indexOf(Buffer.from(title, 'latin1'))
  const numberIndex = buffer.indexOf(Buffer.from(number, 'latin1'), titleIndex + title.length)
  assert(titleIndex >= 0, `No se encontro el titulo ${title}`)
  assert(numberIndex > titleIndex, `No se encontro el numero despues de ${title}`)
  assert(!buffer.subarray(titleIndex, numberIndex).includes(LF), `${title} salto encima del numero`)
}

function assertBoldText(buffer, text) {
  const marker = Buffer.from(text, 'latin1')
  const index = buffer.indexOf(marker)
  assert(index >= 0, `No se encontro el texto ${text}`)
  const expectedCommands = Buffer.from([0x1b, 0x45, 0x01])
  const recentCommands = buffer.subarray(Math.max(0, index - 12), index)
  assert(recentCommands.includes(expectedCommands), `${text} debe imprimirse en negrita`)
  const lastSizeCommand = buffer.lastIndexOf(Buffer.from([0x1d, 0x21]), index)
  assert(lastSizeCommand >= 0 && buffer[lastSizeCommand + 2] === 0x00, `${text} debe usar el tamano normal`)
}

function assertHighlightedModifier(buffer, text) {
  assertBoldText(buffer, text)
  const marker = Buffer.from(text, 'latin1')
  const index = buffer.indexOf(marker)
  const recentCommands = buffer.subarray(Math.max(0, index - 12), index)
  assert(recentCommands.includes(Buffer.from([0x1b, 0x20, 0x03])), `${text} debe usar ampliacion suave`)
  assert(buffer.subarray(index - 4, index).equals(Buffer.from('    ', 'latin1')), `${text} debe conservar la sangria solicitada`)
}

const localTable = buildOrder()
const localPickup = buildOrder({ fulfillmentType: 'pickup', tableInfo: '' })
const whatsappPickup = buildOrder({ orderSource: 'whatsapp', fulfillmentType: 'pickup', tableInfo: '' })
const whatsappDelivery = buildOrder({ orderSource: 'whatsapp', fulfillmentType: 'delivery', tableInfo: '' })

assert(countSequence(bytes(ticketsCajaBase64(localTable)), CUT) === 2, 'Caja local debe imprimir cliente y cocina con dos cortes')
assert(countSequence(bytes(ticketsCajaBase64(localPickup)), CUT) === 2, 'Para llevar local debe conservar los dos cortes')
assert(countSequence(bytes(ticketsCajaBase64(whatsappPickup)), CUT) === 1, 'WhatsApp recojo debe imprimir un solo ticket')
assert(countSequence(bytes(ticketsCajaBase64(whatsappDelivery)), CUT) === 1, 'WhatsApp delivery debe imprimir un solo ticket')
assert(countSequence(bytes(ticketClienteBase64(localTable)), CUT) === 1, 'La copia individual de cliente debe tener un corte')
assert(countSequence(bytes(ticketCocinaBase64(localTable)), CUT) === 1, 'La copia individual de cocina debe tener un corte')

assertHeadingSharesLine(bytes(ticketCocinaBase64(localTable)), 'MESA', '#001')
assertHeadingSharesLine(bytes(ticketCocinaBase64(localPickup)), 'PARA LLEVAR', '#001')
assertHeadingSharesLine(bytes(ticketCocinaBase64(whatsappPickup)), 'RECOJO', '#001')
assertHeadingSharesLine(bytes(ticketCocinaBase64(whatsappDelivery)), 'DELIVERY', '#001')

const whatsappTicket = bytes(ticketCocinaBase64(whatsappDelivery))
assertHeadingSharesLine(whatsappTicket, 'DELIVERY, 16:10', '#001')
assert(!whatsappTicket.includes(Buffer.from('HORA ENTREGA', 'latin1')), 'La hora no debe repetirse debajo del encabezado')

const orderWithModifiers = buildOrder({
  items: [{
    id: 'item-modifiers',
    name: 'Burger Lab Simple Con Papas',
    quantity: 1,
    lineTotal: 26,
    modifiers: {
      extras: [{ id: 'tocino', name: 'Tocino', price: 4 }],
      options: ['Sin cebolla'],
      note: '',
    },
  }],
  total: 26,
})
const kitchenWithModifiers = bytes(ticketCocinaBase64(orderWithModifiers))
assertHighlightedModifier(kitchenWithModifiers, '+ Tocino')
assertHighlightedModifier(kitchenWithModifiers, '+ Sin cebolla')
assert(!kitchenWithModifiers.includes(Buffer.from('EXTRAS:', 'latin1')), 'El ticket no debe anteponer EXTRAS al nombre')
assert(!kitchenWithModifiers.includes(Buffer.from('OPCION:', 'latin1')), 'El ticket no debe anteponer OPCION al modificador')
const productIndex = kitchenWithModifiers.indexOf(Buffer.from('1x Burger Lab', 'latin1'))
const extraIndex = kitchenWithModifiers.indexOf(Buffer.from('+ Tocino', 'latin1'), productIndex)
const priceIndex = kitchenWithModifiers.indexOf(Buffer.from('Bs 26', 'latin1'), extraIndex)
assert(productIndex >= 0 && extraIndex > productIndex && priceIndex > extraIndex, 'El extra debe quedar pegado debajo del producto, antes del precio')
assertHighlightedModifier(bytes(ticketClienteBase64({ ...orderWithModifiers, orderSource: 'whatsapp' })), '+ Tocino')
assertHighlightedModifier(bytes(ticketClienteBase64({ ...orderWithModifiers, orderSource: 'whatsapp' })), '+ Sin cebolla')

const orderWithTwoItems = buildOrder({
  items: [
    buildOrder().items[0],
    {
      id: 'item-2',
      name: 'BBQ Simple Sin Papas',
      quantity: 1,
      lineTotal: 20,
      modifiers: { extras: [], options: [], note: '' },
    },
  ],
  total: 42,
})
const compactKitchen = bytes(ticketCocinaBase64(orderWithTwoItems))
const firstPriceIndex = compactKitchen.indexOf(Buffer.from('Bs 22', 'latin1'))
const secondProductIndex = compactKitchen.indexOf(Buffer.from('1x BBQ Simple Sin Papas', 'latin1'), firstPriceIndex)
const lineBreaksBetweenProducts = Array.from(compactKitchen.subarray(firstPriceIndex, secondProductIndex))
  .filter((value) => value === LF).length
assert(lineBreaksBetweenProducts === 1, 'No debe quedar una linea vacia completa entre productos')

console.log('PASS: tickets, cortes, modalidades y encabezados ESC/POS correctos.')

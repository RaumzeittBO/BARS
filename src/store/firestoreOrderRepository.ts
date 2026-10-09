import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  runTransaction,
  type DocumentData,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseContext } from '../lib/firebase'
import { formatOrderNumber } from '../lib/orderNumber'
import { syncServerClock } from '../lib/serverClock'
import type { AppState, ConfirmPaymentInput, CreateOrderInput, FulfillmentType, Order, OrderStatus, RepositoryStatus } from '../types'
import { buildDefaultState, createRepositoryStatus, normalizeOrder, updateOrderStatus, updateOrderCancelStatus, updateOrderPayment, updateOrderFields } from './orderRepository'

type Listener = () => void

function toIsoDate(value: unknown, fallback?: string) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString()
  }

  return fallback
}

function getTodayKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function migrateFulfillmentType(data: DocumentData): FulfillmentType {
  if (data.fulfillmentType && ['table', 'pickup', 'delivery'].includes(data.fulfillmentType)) {
    return data.fulfillmentType as FulfillmentType
  }
  if (data.orderType === 'delivery') return 'delivery'
  return 'table'
}

function mapDocToOrder(id: string, data: DocumentData): Order {
  const fallbackCreatedAt = new Date().toISOString()
  const normalized = normalizeOrder(data as Record<string, unknown>)
  return {
    id,
    sequence: Number(data.sequence ?? 0),
    displayNumber: String(data.displayNumber ?? '#000'),
    createdAt: toIsoDate(data.createdAt, fallbackCreatedAt) ?? fallbackCreatedAt,
    readyAt: toIsoDate(data.readyAt),
    deliveredAt: toIsoDate(data.deliveredAt),
    cancelledAt: toIsoDate(data.cancelledAt),
    cancelledBy: data.cancelledBy,
    cancelledReason: data.cancelledReason,
    paidAt: toIsoDate(data.paidAt),
    paidBy: data.paidBy,
    estimatedDelay: typeof data.estimatedDelay === 'number' ? data.estimatedDelay : undefined,
    status: (data.status as OrderStatus | undefined) ?? 'pending',
    items: Array.isArray(data.items)
      ? data.items.map((item: any) => ({
          id: item.id || Math.random().toString(),
          name: String(item.name || ''),
          basePrice: Number(item.basePrice || 0),
          quantity: Number(item.quantity || 1),
          lineTotal: Number(item.lineTotal || 0),
          modifiers: {
            extras: Array.isArray(item.modifiers?.extras) ? item.modifiers.extras : [],
            options: Array.isArray(item.modifiers?.options) ? item.modifiers.options : [],
            note: String(item.modifiers?.note || ''),
          },
        }))
      : [],
    total: Number(data.total ?? 0),
    productSubtotal: typeof data.productSubtotal === 'number' ? data.productSubtotal : undefined,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : undefined,
    deliveryDistanceKm: typeof data.deliveryDistanceKm === 'number' ? data.deliveryDistanceKm : null,
    deliveryQuoteStatus: data.deliveryQuoteStatus ?? undefined,
    deliveryQuoteNote: data.deliveryQuoteNote ?? undefined,
    payment: normalized.payment!,
    paymentStatus: normalized.paymentStatus!,
    paymentMethod: normalized.paymentMethod!,
    expectedPaymentMethod: normalized.expectedPaymentMethod!,
    orderSource: data.orderSource ?? 'local',
    fulfillmentType: migrateFulfillmentType(data),
    tableInfo: data.tableInfo ?? '',
    customerName: data.customerName ?? undefined,
    customerPhone: data.customerPhone ?? undefined,
    deliveryAddress: data.deliveryAddress ?? undefined,
    createdBy: data.createdBy ?? undefined,
    whatsappChatId: data.whatsappChatId ?? undefined,
    suppressWhatsappDispatchNotice: Boolean(data.suppressWhatsappDispatchNotice),
    forceWhatsappDispatchNotice: Boolean(data.forceWhatsappDispatchNotice),
  }
}

function getMostRecentServerField(data: DocumentData) {
  return data.updatedAt ?? data.createdAt
}

const readyStatuses = new Set<OrderStatus>(['ready', 'ready_for_pickup', 'ready_for_dispatch'])

export class FirestoreOrderRepository {
  private state: AppState = buildDefaultState()
  private status: RepositoryStatus = createRepositoryStatus('connecting', {
    source: 'firebase',
    detail: 'Inicializando Firebase...',
    hasPendingWrites: false,
  })
  private readonly listeners = new Set<Listener>()
  private readonly statusListeners = new Set<Listener>()
  private readonly todayKey = getTodayKey()
  private pendingOperations = 0
  private started = false
  private lastSnapshotFromCache = true
  private unsubscribes: Unsubscribe[] = []
  private readonly daysOrders = new Map<string, Order[]>()
  // El contador de "hoy" tiene que venir del documento del dia, no adivinarse. Antes se calculaba
  // como el maximo de sequence entre los pedidos visibles localmente: si se borraba el pedido con
  // el numero mas alto del dia (una accion normal de caja), el contador local bajaba pero
  // Firestore nunca olvida el numero real ya usado, y CUALQUIER pedido nuevo quedaba rechazado
  // para siempre ese dia con "Missing or insufficient permissions" - sin relacion con el tipo de
  // pedido, solo con haber borrado algo antes.
  private todaySequenceFromDayDoc: number | null = null
  private lastHasPendingWrites = false

  constructor() {
    window.addEventListener('online', this.handleNetworkChange)
    window.addEventListener('offline', this.handleNetworkChange)
    void this.start()
  }

  read() {
    return this.state
  }

  getStatus() {
    return this.status
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeStatus(listener: Listener) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  save(state: AppState) {
    this.state = state
    this.emitState()
  }

  destroy() {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    window.removeEventListener('online', this.handleNetworkChange)
    window.removeEventListener('offline', this.handleNetworkChange)
    this.listeners.clear()
    this.statusListeners.clear()
    this.started = false
  }

  async placeOrder(order: CreateOrderInput) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    this.pendingOperations += 1
    this.refreshStatus('Sincronizando nuevo pedido...')

    try {
      const dayRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', this.todayKey)
      const ordersRef = collection(dayRef, 'orders')
      const orderRef = doc(ordersRef)

      // El numero de pedido se lee del documento del dia DENTRO de una transaccion, no del estado
      // local. Antes se elegia entre crear y actualizar ese documento segun si el contador local
      // era 0, y eso rompia de dos formas:
      //   - Si el documento del dia ya existia pero el contador local decia 0 (por ejemplo porque
      //     se borro el pedido con el numero mas alto), se tomaba la rama de CREAR: eso reescribe
      //     createdAt, y isValidDayUpdate exige que createdAt no cambie -> Firestore rechazaba con
      //     "Missing or insufficient permissions" cualquier pedido, de cualquier tipo, el resto
      //     del dia.
      //   - Dos cajas pidiendo a la vez calculaban el mismo numero y una de las dos fallaba.
      // La transaccion resuelve las dos: lee el numero real y decide crear o actualizar segun si
      // el documento existe de verdad. Es el mismo enfoque que ya usaba el bot, que nunca fallo.
      const createdOrder = await runTransaction(firebase.db, async (transaction) => {
        const daySnapshot = await transaction.get(dayRef)
        const dayExists = daySnapshot.exists()
        const nextSequence = dayExists ? Number(daySnapshot.data()?.sequence ?? 0) + 1 : 1
        const nextDisplayNumber = formatOrderNumber(nextSequence)

        if (dayExists) {
          transaction.update(dayRef, {
            sequence: nextSequence,
            updatedAt: serverTimestamp(),
          })
        } else {
          transaction.set(dayRef, {
            dayKey: this.todayKey,
            restaurantId: firebase.restaurantId,
            sequence: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }

        transaction.set(orderRef, {
        id: orderRef.id,
        sequence: nextSequence,
        displayNumber: nextDisplayNumber,
        createdAt: serverTimestamp(),
        status: 'pending',
        items: order.items,
        total: order.total,
        payment: order.payment,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        expectedPaymentMethod: order.expectedPaymentMethod ?? null,
        orderSource: order.orderSource,
        fulfillmentType: order.fulfillmentType,
        tableInfo: order.tableInfo ?? '',
        customerName: order.customerName ?? '',
        customerPhone: order.customerPhone ?? '',
        whatsappChatId: order.whatsappChatId ?? '',
        deliveryAddress: order.deliveryAddress ?? '',
        suppressWhatsappDispatchNotice: order.suppressWhatsappDispatchNotice ?? false,
        forceWhatsappDispatchNotice: order.forceWhatsappDispatchNotice ?? false,
        createdBy: order.createdBy ?? '',
        updatedAt: serverTimestamp(),
        })

        return { sequence: nextSequence, displayNumber: nextDisplayNumber }
      })

      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('Pedido sincronizado en tiempo real.')
      return { id: orderRef.id, ...createdOrder }
    } catch (error) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('No se pudo enviar el pedido a Firebase.')
      throw error
    }
  }

  async setOrderStatus(orderId: string, status: OrderStatus, estimatedDelay?: number, options?: { suppressWhatsappDispatchNotice?: boolean; forceWhatsappDispatchNotice?: boolean }) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const order = this.state.orders.find((o) => o.id === orderId)
    const targetDayKey = order?.dayKey || this.todayKey

    const previousState = this.state
    const readyAt = readyStatuses.has(status) ? new Date().toISOString() : undefined
    const deliveredAt = status === 'delivered' ? new Date().toISOString() : undefined
    // Solo es "deshacer entrega" si el pedido ESTABA entregado y deja de estarlo. Limpiar las
    // marcas en cualquier otro cambio de estado agregaria campos que las reglas no permiten en
    // esa transicion (por ejemplo al enviar a cocina) y Firestore rechazaria el cambio entero.
    const isUndoingDelivery = order?.status === 'delivered' && status !== 'delivered'
    this.state = updateOrderStatus(this.state, orderId, status, readyAt, deliveredAt, options, estimatedDelay)
    this.emitState()

    this.pendingOperations += 1
    this.refreshStatus('Sincronizando cambio de estado...')

    try {
      const orderRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', targetDayKey, 'orders', orderId)
      await updateDoc(orderRef, {
        status,
        ...(estimatedDelay !== undefined ? { estimatedDelay } : {}),
        ...(readyStatuses.has(status) ? { readyAt: serverTimestamp() } : {}),
        // Al deshacer una entrega hay que borrar TAMBIEN las marcas del aviso de WhatsApp. Si
        // quedaba "suppress" en true (por ejemplo porque la entrega salio tarde y se eligio no
        // avisar), sobrevivia al deshacer y el aviso de "su moto ya esta en camino" no volvia a
        // salir nunca mas para ese pedido.
        ...(status === 'delivered' ? { deliveredAt: serverTimestamp() } : {}),
        ...(isUndoingDelivery
          ? {
              deliveredAt: deleteField(),
              whatsappDispatchSentAt: deleteField(),
              suppressWhatsappDispatchNotice: false,
              forceWhatsappDispatchNotice: false,
            }
          : {}),
        ...(options?.suppressWhatsappDispatchNotice !== undefined ? { suppressWhatsappDispatchNotice: options.suppressWhatsappDispatchNotice } : {}),
        ...(options?.forceWhatsappDispatchNotice !== undefined ? { forceWhatsappDispatchNotice: options.forceWhatsappDispatchNotice } : {}),
        updatedAt: serverTimestamp(),
      })
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('Estado actualizado en tiempo real.')
    } catch (error) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.state = previousState
      this.emitState()
      this.refreshStatus('No se pudo actualizar el estado en Firebase.')
      throw error
    }
  }

  async cancelOrder(orderId: string, cancelledBy: string, cancelledReason?: string) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const order = this.state.orders.find((o) => o.id === orderId)
    const targetDayKey = order?.dayKey || this.todayKey

    const previousState = this.state
    this.state = updateOrderCancelStatus(this.state, orderId, cancelledBy, cancelledReason)
    this.emitState()

    this.pendingOperations += 1
    this.refreshStatus('Sincronizando cancelacion...')

    try {
      const orderRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', targetDayKey, 'orders', orderId)
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy,
        cancelledReason: cancelledReason || '',
        updatedAt: serverTimestamp(),
      })
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('Pedido anulado en tiempo real.')
    } catch (error) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.state = previousState
      this.emitState()
      this.refreshStatus('No se pudo anular el pedido en Firebase.')
      throw error
    }
  }

  async confirmPayment(orderId: string, input: ConfirmPaymentInput) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const order = this.state.orders.find((o) => o.id === orderId)
    const targetDayKey = order?.dayKey || this.todayKey

    const previousState = this.state
    this.state = updateOrderPayment(this.state, orderId, input)
    this.emitState()

    this.pendingOperations += 1
    this.refreshStatus('Sincronizando pago...')

    try {
      const orderRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', targetDayKey, 'orders', orderId)
      await updateDoc(orderRef, {
        paymentStatus: 'paid',
        paymentMethod: input.paymentMethod,
        payment: input.payment,
        paidAt: serverTimestamp(),
        paidBy: input.paidBy,
        updatedAt: serverTimestamp(),
      })
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('Pago confirmado en tiempo real.')
    } catch (error) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.state = previousState
      this.emitState()
      this.refreshStatus('No se pudo confirmar el pago en Firebase.')
      throw error
    }
  }

  async updateOrder(orderId: string, input: Omit<CreateOrderInput, 'createdBy'>) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const order = this.state.orders.find((o) => o.id === orderId)
    const targetDayKey = order?.dayKey || this.todayKey

    const previousState = this.state
    this.state = updateOrderFields(this.state, orderId, input)
    this.emitState()

    this.pendingOperations += 1
    this.refreshStatus('Sincronizando modificacion de pedido...')

    try {
      const orderRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', targetDayKey, 'orders', orderId)
      await updateDoc(orderRef, {
        items: input.items,
        total: input.total,
        payment: input.payment,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        expectedPaymentMethod: input.expectedPaymentMethod ?? null,
        orderSource: input.orderSource,
        fulfillmentType: input.fulfillmentType,
        tableInfo: input.tableInfo ?? '',
        customerName: input.customerName ?? '',
        customerPhone: input.customerPhone ?? '',
        whatsappChatId: input.whatsappChatId ?? order?.whatsappChatId ?? '',
        deliveryAddress: input.deliveryAddress ?? '',
        suppressWhatsappDispatchNotice: input.suppressWhatsappDispatchNotice ?? false,
        forceWhatsappDispatchNotice: input.forceWhatsappDispatchNotice ?? false,
        updatedAt: serverTimestamp(),
      })
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('Pedido modificado en tiempo real.')
    } catch (error) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.state = previousState
      this.emitState()
      this.refreshStatus('No se pudo modificar el pedido en Firebase.')
      throw error
    }
  }

  async deleteOrder(orderId: string, deletedBy = 'Sistema') {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const order = this.state.orders.find((o) => o.id === orderId)
    const targetDayKey = order?.dayKey || this.todayKey

    const previousState = this.state
    this.state = updateOrderCancelStatus(this.state, orderId, deletedBy, 'Eliminado desde el sistema')
    this.emitState()

    this.pendingOperations += 1
    this.refreshStatus('Registrando pedido eliminado...')

    try {
      const orderRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', targetDayKey, 'orders', orderId)
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: deletedBy,
        cancelledReason: 'Eliminado desde el sistema',
        updatedAt: serverTimestamp(),
      })
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.refreshStatus('Pedido movido al historial de eliminados.')
    } catch (error) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1)
      this.state = previousState
      this.emitState()
      this.refreshStatus('No se pudo eliminar el pedido en Firebase.')
      throw error
    }
  }

  private async start() {
    if (this.started) {
      return
    }

    this.started = true

    try {
      const firebase = await getFirebaseContext()

      if (!firebase) {
        this.setStatus(
          createRepositoryStatus('offline', {
            source: 'firebase',
            detail: 'Faltan variables de Firebase.',
            hasPendingWrites: false,
          }),
        )
        return
      }

      const currentUser = firebase.auth.currentUser
      let role = 'caja'
      if (currentUser) {
        const memberRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'members', currentUser.uid)
        const memberSnap = await getDoc(memberRef)
        if (memberSnap.exists()) {
          role = memberSnap.data().role || 'caja'
        }
      }

      const daysToQueryAll = 31
      const daysToQueryPending = 60
      const now = new Date()

      const dayKeysWithFilter: Array<{ dayKey: string; onlyPending: boolean }> = []
      for (let i = 0; i < daysToQueryPending; i++) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const dayKey = `${year}-${month}-${day}`
        
        dayKeysWithFilter.push({
          dayKey,
          onlyPending: i >= daysToQueryAll,
        })
      }

      const todayDocRef = doc(firebase.db, 'restaurants', firebase.restaurantId, 'days', this.todayKey)
      const unsubscribeTodayDoc = onSnapshot(
        todayDocRef,
        (docSnapshot) => {
          this.todaySequenceFromDayDoc = docSnapshot.exists() ? Number(docSnapshot.data()?.sequence ?? 0) : 0
          this.mergeAndEmit(this.lastHasPendingWrites)
        },
        (error) => this.handleSnapshotError(error),
      )
      this.unsubscribes.push(unsubscribeTodayDoc)

      dayKeysWithFilter.forEach(({ dayKey, onlyPending }) => {
        const ordersRef = collection(firebase.db, 'restaurants', firebase.restaurantId, 'days', dayKey, 'orders')
        let ordersQuery
        if (role === 'pedidos' && currentUser) {
          ordersQuery = query(ordersRef, where('createdBy', '==', currentUser.uid))
        } else if (onlyPending) {
          ordersQuery = query(ordersRef, where('paymentStatus', '==', 'pending'))
        } else {
          ordersQuery = query(ordersRef, orderBy('sequence', 'desc'))
        }

        const unsubscribe = onSnapshot(
          ordersQuery,
          { includeMetadataChanges: true },
          (snapshot) => this.handleDaySnapshot(dayKey, snapshot),
          (error) => this.handleSnapshotError(error),
        )
        this.unsubscribes.push(unsubscribe)
      })
    } catch (error) {
      this.handleSnapshotError(error as FirestoreError)
    }
  }

  private handleDaySnapshot(dayKey: string, snapshot: QuerySnapshot<DocumentData>) {
    const latestServerField = snapshot.docs.reduce<unknown>((latestValue, documentSnapshot) => {
      const nextValue = getMostRecentServerField(documentSnapshot.data())

      if (!latestValue) {
        return nextValue
      }

      const latestMs = Date.parse(toIsoDate(latestValue, '') ?? '')
      const nextMs = Date.parse(toIsoDate(nextValue, '') ?? '')

      if (!Number.isFinite(nextMs)) {
        return latestValue
      }

      if (!Number.isFinite(latestMs) || nextMs > latestMs) {
        return nextValue
      }

      return latestValue
    }, null)

    if (latestServerField) {
      syncServerClock(latestServerField)
    }

    const orders = snapshot.docs.map((documentSnapshot) => {
      const order = mapDocToOrder(documentSnapshot.id, documentSnapshot.data())
      order.dayKey = dayKey
      return order
    })

    this.daysOrders.set(dayKey, orders)
    this.lastSnapshotFromCache = snapshot.metadata.fromCache

    this.mergeAndEmit(snapshot.metadata.hasPendingWrites)
  }

  private mergeAndEmit(hasPendingWrites = false) {
    const allOrders: Order[] = []
    this.daysOrders.forEach((orders) => {
      allOrders.push(...orders)
    })

    allOrders.sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime()
      const rightTime = new Date(right.createdAt).getTime()
      if (leftTime !== rightTime) {
        return rightTime - leftTime
      }
      return right.sequence - left.sequence
    })

    const todayOrders = this.daysOrders.get(this.todayKey) || []
    const highestTodaySequence = todayOrders.reduce((max, order) => Math.max(max, order.sequence), 0)
    // El campo del documento manda; el maximo local solo cubre el instante antes de que ese
    // listener cargue por primera vez. Math.max evita que el contador retroceda si llegaran
    // desordenados.
    const sequence = Math.max(highestTodaySequence, this.todaySequenceFromDayDoc ?? 0)

    this.lastHasPendingWrites = hasPendingWrites
    this.state = {
      orders: allOrders,
      sequence,
      lastUpdatedAt: Date.now(),
    }

    this.emitState()
    this.refreshStatus(hasPendingWrites ? 'Guardando cambios...' : 'Tiempo real activo.')
  }

  private handleSnapshotError(error: FirestoreError) {
    this.setStatus(
      createRepositoryStatus('offline', {
        source: 'firebase',
        detail: `Sin acceso a Firestore: ${error.message}`,
        hasPendingWrites: this.pendingOperations > 0,
      }),
    )
  }

  private handleNetworkChange = () => {
    this.refreshStatus(this.status.detail)
  }

  private refreshStatus(detail: string) {
    const isOnline = navigator.onLine
    let mode: RepositoryStatus['mode']

    if (!isOnline) {
      mode = 'offline'
    } else if (this.pendingOperations > 0 || this.lastSnapshotFromCache) {
      mode = 'connecting'
    } else {
      mode = 'connected'
    }

    this.setStatus(
      createRepositoryStatus(mode, {
        source: 'firebase',
        detail:
          mode === 'offline'
            ? 'Sin internet. Se mostrara el ultimo estado disponible hasta recuperar la red.'
            : detail,
        hasPendingWrites: this.pendingOperations > 0,
      }),
    )
  }

  private emitState() {
    this.listeners.forEach((listener) => listener())
  }

  private setStatus(status: RepositoryStatus) {
    this.status = status
    this.statusListeners.forEach((listener) => listener())
  }
}

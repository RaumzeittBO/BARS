import type { AppState, ConfirmPaymentInput, CreateOrderInput, FulfillmentType, Order, OrderStatus, PlacedOrderResult, RepositoryConnectionMode, RepositoryStatus } from '../types'
import { formatOrderNumber } from '../lib/orderNumber'

export interface OrdersRepository {
  read(): AppState
  save(state: AppState): void | Promise<void>
  subscribe(listener: () => void): () => void
  getStatus(): RepositoryStatus
  subscribeStatus(listener: () => void): () => void
  placeOrder(order: CreateOrderInput): Promise<PlacedOrderResult>
  setOrderStatus(orderId: string, status: OrderStatus, estimatedDelay?: number, options?: { suppressWhatsappDispatchNotice?: boolean; forceWhatsappDispatchNotice?: boolean }): Promise<void>
  cancelOrder(orderId: string, cancelledBy: string, cancelledReason?: string): Promise<void>
  confirmPayment(orderId: string, input: ConfirmPaymentInput): Promise<void>
  updateOrder(orderId: string, input: Omit<CreateOrderInput, 'createdBy'>): Promise<void>
  deleteOrder(orderId: string, deletedBy?: string): Promise<void>
  destroy?(): void
}

const STORAGE_KEY = 'comandero.orders.v1'
const CHANNEL_NAME = 'comandero-sync'

export function buildDefaultState(): AppState {
  return {
    orders: [],
    sequence: 0,
    lastUpdatedAt: Date.now(),
  }
}

export function createRepositoryStatus(
  mode: RepositoryConnectionMode,
  options: Partial<Omit<RepositoryStatus, 'mode' | 'label'>>,
): RepositoryStatus {
  const baseLabels: Record<RepositoryConnectionMode, string> = {
    connected: 'Conectado',
    connecting: 'Conectando',
    local: 'Modo local',
    offline: 'Offline',
  }

  return {
    mode,
    label: baseLabels[mode],
    source: options.source ?? 'local',
    detail: options.detail ?? '',
    hasPendingWrites: options.hasPendingWrites ?? false,
    isOnline: options.isOnline ?? navigator.onLine,
  }
}

/** Maps legacy orderType to new fulfillmentType */
function migrateFulfillmentType(order: Record<string, unknown>): FulfillmentType {
  if (order.fulfillmentType && typeof order.fulfillmentType === 'string') {
    if (['table', 'pickup', 'delivery'].includes(order.fulfillmentType)) {
      return order.fulfillmentType as FulfillmentType
    }
  }
  // Legacy: orderType was 'table' | 'delivery'
  if (order.orderType === 'delivery') return 'delivery'
  return 'table'
}

export function normalizeOrder(raw: Record<string, unknown>): Partial<Order> {
  const paymentStatus = (raw.paymentStatus as 'paid' | 'pending' | 'gift') ?? 'paid'
  const rawPayment = raw.payment as Record<string, unknown> | undefined
  const paymentMethod = (raw.paymentMethod as 'cash' | 'qr' | 'mixed' | null) ?? (rawPayment?.method as 'cash' | 'qr' | 'mixed' || null)
  const isPendingOrGift = paymentStatus === 'pending' || paymentStatus === 'gift'
  return {
    readyAt: typeof raw.readyAt === 'string' ? raw.readyAt : undefined,
    deliveredAt: typeof raw.deliveredAt === 'string' ? raw.deliveredAt : undefined,
    cancelledAt: typeof raw.cancelledAt === 'string' ? raw.cancelledAt : undefined,
    cancelledBy: typeof raw.cancelledBy === 'string' ? raw.cancelledBy : undefined,
    cancelledReason: typeof raw.cancelledReason === 'string' ? raw.cancelledReason : undefined,
    paidAt: typeof raw.paidAt === 'string' ? raw.paidAt : undefined,
    paidBy: typeof raw.paidBy === 'string' ? raw.paidBy : undefined,
    estimatedDelay: typeof raw.estimatedDelay === 'number' ? raw.estimatedDelay : undefined,
    payment: {
      method: rawPayment?.method as 'cash' | 'qr' | 'mixed' ?? 'cash',
      cashAmount: isPendingOrGift ? 0 : Number(rawPayment?.cashAmount ?? raw.total ?? 0),
      qrAmount: isPendingOrGift ? 0 : Number(rawPayment?.qrAmount ?? 0),
      cashReceived: isPendingOrGift ? 0 : Number(rawPayment?.cashReceived ?? raw.total ?? 0),
      change: isPendingOrGift ? 0 : Number(rawPayment?.change ?? 0),
      // El desglose por cuentas solo existe en los pagos repartidos. Se omite la clave cuando no
      // hay: escribir `undefined` haria que Firestore rechace el pedido entero.
      ...(Array.isArray(rawPayment?.qrCuentas) && !isPendingOrGift
        ? { qrCuentas: (rawPayment.qrCuentas as unknown[]).map((monto) => Number(monto) || 0) }
        : {}),
    },
    paymentStatus,
    paymentMethod: isPendingOrGift ? null : paymentMethod,
    expectedPaymentMethod: (raw.expectedPaymentMethod as 'cash' | 'qr' | 'mixed' | null) ?? null,
    qrProofReceived: Boolean(raw.qrProofReceived),
    paymentReviewNote: (raw.paymentReviewNote as string) ?? undefined,
    suppressWhatsappDispatchNotice: Boolean(raw.suppressWhatsappDispatchNotice),
    forceWhatsappDispatchNotice: Boolean(raw.forceWhatsappDispatchNotice),
    productSubtotal: typeof raw.productSubtotal === 'number' ? raw.productSubtotal : undefined,
    deliveryFee: typeof raw.deliveryFee === 'number' ? raw.deliveryFee : undefined,
    deliveryDistanceKm: typeof raw.deliveryDistanceKm === 'number' ? raw.deliveryDistanceKm : null,
    deliveryQuoteStatus: (raw.deliveryQuoteStatus as Order['deliveryQuoteStatus']) ?? undefined,
    deliveryQuoteNote: (raw.deliveryQuoteNote as string) ?? undefined,
    orderSource: (raw.orderSource as 'local' | 'whatsapp') ?? 'local',
    fulfillmentType: migrateFulfillmentType(raw),
    tableInfo: (raw.tableInfo as string) ?? '',
    customerName: (raw.customerName as string) ?? undefined,
    customerPhone: (raw.customerPhone as string) ?? undefined,
    customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
    deliveryAddress: (raw.deliveryAddress as string) ?? undefined,
    createdBy: (raw.createdBy as string) ?? undefined,
    items: Array.isArray(raw.items)
      ? raw.items.map((item: any) => ({
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
  }
}

export function buildOrderRecord(currentState: AppState, order: CreateOrderInput): AppState {
  const sequence = currentState.sequence + 1
  const nextOrder: Order = {
    ...order,
    id: crypto.randomUUID(),
    sequence,
    displayNumber: formatOrderNumber(sequence),
    createdAt: new Date().toISOString(),
    readyAt: undefined,
    deliveredAt: undefined,
    status: 'pending',
    expectedPaymentMethod: order.expectedPaymentMethod ?? null,
    orderSource: order.orderSource,
    fulfillmentType: order.fulfillmentType,
  }

  return {
    orders: [nextOrder, ...currentState.orders],
    sequence,
    lastUpdatedAt: Date.now(),
  }
}

const readyStatuses = new Set<OrderStatus>(['ready', 'ready_for_pickup', 'ready_for_dispatch'])

export function updateOrderStatus(
  state: AppState,
  orderId: string,
  status: OrderStatus,
  readyAt?: string,
  deliveredAt?: string,
  options?: { suppressWhatsappDispatchNotice?: boolean; forceWhatsappDispatchNotice?: boolean },
  estimatedDelay?: number,
): AppState {
  return {
    ...state,
    lastUpdatedAt: Date.now(),
    orders: state.orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            status,
            readyAt: readyStatuses.has(status) ? readyAt ?? order.readyAt ?? new Date().toISOString() : order.readyAt,
            deliveredAt:
              status === 'delivered' ? deliveredAt ?? order.deliveredAt ?? new Date().toISOString() : undefined,
            estimatedDelay: estimatedDelay ?? order.estimatedDelay,
            suppressWhatsappDispatchNotice: options?.suppressWhatsappDispatchNotice ?? order.suppressWhatsappDispatchNotice,
            forceWhatsappDispatchNotice: options?.forceWhatsappDispatchNotice ?? order.forceWhatsappDispatchNotice,
          }
        : order,
    ),
  }
}

export function updateOrderCancelStatus(
  state: AppState,
  orderId: string,
  cancelledBy: string,
  cancelledReason?: string,
): AppState {
  return {
    ...state,
    lastUpdatedAt: Date.now(),
    orders: state.orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy,
            cancelledReason,
          }
        : order,
    ),
  }
}

export function updateOrderPayment(
  state: AppState,
  orderId: string,
  input: ConfirmPaymentInput,
): AppState {
  return {
    ...state,
    lastUpdatedAt: Date.now(),
    orders: state.orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            paymentStatus: 'paid',
            paymentMethod: input.paymentMethod,
            payment: input.payment,
            paidAt: new Date().toISOString(),
            paidBy: input.paidBy,
          }
        : order,
    ),
  }
}

export function updateOrderFields(
  state: AppState,
  orderId: string,
  input: Omit<CreateOrderInput, 'createdBy'>,
): AppState {
  return {
    ...state,
    lastUpdatedAt: Date.now(),
    orders: state.orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            items: input.items,
            total: input.total,
            payment: input.payment,
            paymentStatus: input.paymentStatus,
            paymentMethod: input.paymentMethod,
            expectedPaymentMethod: input.expectedPaymentMethod,
            orderSource: input.orderSource,
            fulfillmentType: input.fulfillmentType,
            tableInfo: input.tableInfo ?? '',
            customerName: input.customerName ?? '',
            customerPhone: input.customerPhone ?? '',
            deliveryAddress: input.deliveryAddress ?? '',
            suppressWhatsappDispatchNotice: input.suppressWhatsappDispatchNotice ?? false,
            forceWhatsappDispatchNotice: input.forceWhatsappDispatchNotice ?? false,
          }
        : order,
    ),
  }
}

function readStoredState(): AppState {
  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return buildDefaultState()
  }

  try {
    const parsed = JSON.parse(raw) as AppState
    const normalizedOrders = Array.isArray(parsed.orders)
      ? parsed.orders.map((order) => ({
          ...order,
          ...normalizeOrder(order as unknown as Record<string, unknown>),
        }))
      : []

    return {
      ...buildDefaultState(),
      ...parsed,
      orders: normalizedOrders,
    }
  } catch {
    return buildDefaultState()
  }
}

export function createLocalOrdersRepository(): OrdersRepository {
  const broadcastChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
  const statusListeners = new Set<() => void>()
  let currentState = readStoredState()
  let status = createRepositoryStatus('local', {
    source: 'local',
    detail: 'Firebase no configurado. Los pedidos viven en localStorage.',
    hasPendingWrites: false,
  })

  const emit = () => {
    window.dispatchEvent(new CustomEvent('comandero:local-update'))
    broadcastChannel?.postMessage({ type: 'sync' })
  }

  const emitStatus = () => {
    statusListeners.forEach((listener) => listener())
  }

  return {
    read() {
      return currentState
    },
    save(state) {
      currentState = state
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      emit()
    },
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) {
          currentState = readStoredState()
          listener()
        }
      }

      const onLocalUpdate = () => {
        currentState = readStoredState()
        listener()
      }
      const onBroadcast = () => {
        currentState = readStoredState()
        listener()
      }

      window.addEventListener('storage', onStorage)
      window.addEventListener('comandero:local-update', onLocalUpdate)
      broadcastChannel?.addEventListener('message', onBroadcast)

      return () => {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('comandero:local-update', onLocalUpdate)
        broadcastChannel?.removeEventListener('message', onBroadcast)
      }
    },
    getStatus() {
      return status
    },
    subscribeStatus(listener) {
      statusListeners.add(listener)

      const onNetworkChange = () => {
        status = createRepositoryStatus('local', {
          source: 'local',
          detail: navigator.onLine
            ? 'Firebase no configurado. Los pedidos viven en localStorage.'
            : 'Sin internet, pero el modo local sigue funcionando en este dispositivo.',
          hasPendingWrites: false,
        })
        emitStatus()
      }

      window.addEventListener('online', onNetworkChange)
      window.addEventListener('offline', onNetworkChange)

      return () => {
        statusListeners.delete(listener)
        window.removeEventListener('online', onNetworkChange)
        window.removeEventListener('offline', onNetworkChange)
      }
    },
    async placeOrder(order) {
      const currentState = this.read()
      const nextState = buildOrderRecord(currentState, order)
      this.save(nextState)
      const createdOrder = nextState.orders[0]
      return {
        id: createdOrder?.id ?? '',
        sequence: createdOrder?.sequence ?? currentState.sequence + 1,
        displayNumber: createdOrder?.displayNumber ?? formatOrderNumber(currentState.sequence + 1),
      }
    },
    async setOrderStatus(orderId, nextStatus, estimatedDelay, options) {
      this.save(
        updateOrderStatus(
          this.read(),
          orderId,
          nextStatus,
          readyStatuses.has(nextStatus) ? new Date().toISOString() : undefined,
          nextStatus === 'delivered' ? new Date().toISOString() : undefined,
          options,
          estimatedDelay,
        ),
      )
    },
    async cancelOrder(orderId, cancelledBy, cancelledReason) {
      this.save(
        updateOrderCancelStatus(
          this.read(),
          orderId,
          cancelledBy,
          cancelledReason,
        ),
      )
    },
    async confirmPayment(orderId, input) {
      this.save(
        updateOrderPayment(
          this.read(),
          orderId,
          input,
        ),
      )
    },
    async updateOrder(orderId, input) {
      this.save(
        updateOrderFields(
          this.read(),
          orderId,
          input,
        ),
      )
    },
    async deleteOrder(orderId, deletedBy = 'Sistema') {
      this.save(
        updateOrderCancelStatus(
          this.read(),
          orderId,
          deletedBy,
          'Eliminado desde el sistema',
        ),
      )
    },
  }
}

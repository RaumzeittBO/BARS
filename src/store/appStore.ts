import { useSyncExternalStore } from 'react'
import type { CartItem, ConfirmPaymentInput, CreateOrderInput, OrderItem, OrderStatus, PaymentMethod, PaymentSummary, Product } from '../types'
import { getOrdersRepository } from './repositoryFactory'

function getSnapshot() {
  return getOrdersRepository().read()
}

function subscribe(listener: () => void) {
  return getOrdersRepository().subscribe(listener)
}

function getStatusSnapshot() {
  return getOrdersRepository().getStatus()
}

function subscribeStatus(listener: () => void) {
  return getOrdersRepository().subscribeStatus(listener)
}

export function useOrdersStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const status = useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot)

  return {
    state,
    status,
    async placeOrder(input: Omit<CreateOrderInput, 'items' | 'total'> & {
      cartItems: CartItem[]
      productsById: Map<string, Product>
    }) {
      const items: OrderItem[] = input.cartItems.map((item) => {
        const product = input.productsById.get(item.productId)

        if (!product) {
          throw new Error(`Product not found for ${item.productId}`)
        }

        const extrasTotal = item.modifiers.extras.reduce((total, extra) => total + extra.price, 0)
        const lineTotal = (product.price + extrasTotal) * item.quantity

        return {
          id: item.lineId,
          name: product.name,
          basePrice: product.price,
          quantity: item.quantity,
          modifiers: item.modifiers,
          lineTotal,
        }
      })

      const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
      return getOrdersRepository().placeOrder({
        items,
        total,
        payment: input.payment,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        expectedPaymentMethod: input.expectedPaymentMethod,
        orderSource: input.orderSource,
        fulfillmentType: input.fulfillmentType,
        tableInfo: input.tableInfo,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        whatsappChatId: input.whatsappChatId,
        deliveryAddress: input.deliveryAddress,
        createdBy: input.createdBy,
      })
    },
    /** @deprecated Use placeOrder with full input instead */
    async placeOrderLegacy(
      cartItems: CartItem[],
      productsById: Map<string, Product>,
      payment: PaymentSummary,
      paymentStatus: 'paid' | 'pending',
      paymentMethod: PaymentMethod | null,
      orderType: 'table' | 'delivery',
      tableInfo?: string,
    ) {
      const items: OrderItem[] = cartItems.map((item) => {
        const product = productsById.get(item.productId)

        if (!product) {
          throw new Error(`Product not found for ${item.productId}`)
        }

        const extrasTotal = item.modifiers.extras.reduce((total, extra) => total + extra.price, 0)
        const lineTotal = (product.price + extrasTotal) * item.quantity

        return {
          id: item.lineId,
          name: product.name,
          basePrice: product.price,
          quantity: item.quantity,
          modifiers: item.modifiers,
          lineTotal,
        }
      })

      const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
      return getOrdersRepository().placeOrder({
        items,
        total,
        payment,
        paymentStatus,
        paymentMethod,
        expectedPaymentMethod: null,
        orderSource: 'local',
        fulfillmentType: orderType === 'delivery' ? 'delivery' : 'table',
        tableInfo,
      })
    },
    async setOrderStatus(
      orderId: string,
      status: OrderStatus,
      estimatedDelay?: number,
      options?: { suppressWhatsappDispatchNotice?: boolean; forceWhatsappDispatchNotice?: boolean },
    ) {
      await getOrdersRepository().setOrderStatus(orderId, status, estimatedDelay, options)
    },
    async cancelOrder(orderId: string, cancelledBy: string, cancelledReason?: string) {
      await getOrdersRepository().cancelOrder(orderId, cancelledBy, cancelledReason)
    },
    async confirmPayment(orderId: string, input: ConfirmPaymentInput) {
      await getOrdersRepository().confirmPayment(orderId, input)
    },
    async updateOrder(orderId: string, input: any) {
      let items: OrderItem[] = []
      if (Array.isArray(input.cartItems)) {
        items = input.cartItems.map((item: CartItem) => {
          const product = input.productsById?.get(item.productId)
          const selectedExtras = item.modifiers?.extras || []
          const extrasTotal = selectedExtras.reduce((sum: number, extra: any) => sum + extra.price, 0)
          const basePrice = product?.price || (item as any).price || 0
          const name = product?.name || (item as any).name || 'Producto'
          const lineTotal = (basePrice + extrasTotal) * item.quantity

          return {
            id: item.lineId,
            name,
            basePrice,
            quantity: item.quantity,
            modifiers: item.modifiers,
            lineTotal,
          }
        })
      } else if (Array.isArray(input.items)) {
        items = input.items
      }

      const total = typeof input.total === 'number' ? input.total : items.reduce((sum, item) => sum + (item.lineTotal || 0), 0)

      return getOrdersRepository().updateOrder(orderId, {
        items,
        total,
        payment: input.payment,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        expectedPaymentMethod: input.expectedPaymentMethod,
        orderSource: input.orderSource,
        fulfillmentType: input.fulfillmentType,
        tableInfo: input.tableInfo,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        whatsappChatId: input.whatsappChatId,
        deliveryAddress: input.deliveryAddress,
      })
    },
    async deleteOrder(orderId: string, deletedBy?: string) {
      await getOrdersRepository().deleteOrder(orderId, deletedBy)
    },
  }
}

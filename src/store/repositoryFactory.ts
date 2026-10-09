import { getAuthMode } from './authStore'
import { FirestoreOrderRepository } from './firestoreOrderRepository'
import { createLocalOrdersRepository, type OrdersRepository } from './orderRepository'

let repository: OrdersRepository | null = null

export function getOrdersRepository() {
  if (!repository) {
    repository = getAuthMode() === 'firebase' ? (new FirestoreOrderRepository() as OrdersRepository) : createLocalOrdersRepository()
  }

  return repository
}

export function resetOrdersRepository() {
  repository?.destroy?.()
  repository = null
}

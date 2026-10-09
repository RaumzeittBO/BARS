import { useSyncExternalStore } from 'react'
import type { CatalogCategoryInput, CatalogProductInput, Product, ProductExtra } from '../types'
import { getCatalogRepository } from './catalogRepositoryFactory'

function getSnapshot() {
  return getCatalogRepository().read()
}

function subscribe(listener: () => void) {
  return getCatalogRepository().subscribe(listener)
}

function getStatusSnapshot() {
  return getCatalogRepository().getStatus()
}

function subscribeStatus(listener: () => void) {
  return getCatalogRepository().subscribeStatus(listener)
}

export function useCatalogStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const status = useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot)

  return {
    state,
    status,
    createCategory(input: CatalogCategoryInput) {
      return getCatalogRepository().createCategory(input)
    },
    updateCategory(categoryId: string, updates: Partial<CatalogCategoryInput>) {
      return getCatalogRepository().updateCategory(categoryId, updates)
    },
    setCategoryVisibility(categoryId: string, isVisible: boolean) {
      return getCatalogRepository().setCategoryVisibility(categoryId, isVisible)
    },
    setCategoryActive(categoryId: string, isActive: boolean) {
      return getCatalogRepository().setCategoryActive(categoryId, isActive)
    },
    deleteCategory(categoryId: string) {
      return getCatalogRepository().deleteCategory(categoryId)
    },
    moveCategory(categoryId: string, direction: 'up' | 'down') {
      return getCatalogRepository().moveCategory(categoryId, direction)
    },
    createProduct(input: CatalogProductInput) {
      return getCatalogRepository().createProduct(input)
    },
    updateProduct(productId: string, updates: Partial<CatalogProductInput>) {
      return getCatalogRepository().updateProduct(productId, updates)
    },
    setProductVisibility(productId: string, isVisible: boolean) {
      return getCatalogRepository().setProductVisibility(productId, isVisible)
    },
    setProductActive(productId: string, isActive: boolean) {
      return getCatalogRepository().setProductActive(productId, isActive)
    },
    setProductAvailability(productId: string, availability: Product['availability']) {
      return getCatalogRepository().setProductAvailability(productId, availability)
    },
    deleteProduct(productId: string) {
      return getCatalogRepository().deleteProduct(productId)
    },
    moveProduct(productId: string, direction: 'up' | 'down') {
      return getCatalogRepository().moveProduct(productId, direction)
    },
    initializeDemoCatalog() {
      return getCatalogRepository().initializeDemoCatalog()
    },
    saveQuickExtras(list: ProductExtra[]) {
      return getCatalogRepository().saveQuickExtras(list)
    },
  }
}

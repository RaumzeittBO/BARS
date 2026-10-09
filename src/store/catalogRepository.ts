import { buildDemoCatalogState, demoCategories, demoProducts, demoQuickExtras } from '../data/catalog'
import type {
  CatalogCategory,
  CatalogCategoryInput,
  CatalogProductInput,
  CatalogState,
  Product,
  RepositoryConnectionMode,
  RepositoryStatus,
  ProductExtra,
} from '../types'

export interface CatalogRepository {
  read(): CatalogState
  save(state: CatalogState): void | Promise<void>
  subscribe(listener: () => void): () => void
  getStatus(): RepositoryStatus
  subscribeStatus(listener: () => void): () => void
  createCategory(input: CatalogCategoryInput): Promise<void>
  updateCategory(categoryId: string, updates: Partial<CatalogCategoryInput>): Promise<void>
  setCategoryVisibility(categoryId: string, isVisible: boolean): Promise<void>
  setCategoryActive(categoryId: string, isActive: boolean): Promise<void>
  deleteCategory(categoryId: string): Promise<void>
  moveCategory(categoryId: string, direction: 'up' | 'down'): Promise<void>
  createProduct(input: CatalogProductInput): Promise<void>
  updateProduct(productId: string, updates: Partial<CatalogProductInput>): Promise<void>
  setProductVisibility(productId: string, isVisible: boolean): Promise<void>
  setProductActive(productId: string, isActive: boolean): Promise<void>
  setProductAvailability(productId: string, availability: Product['availability']): Promise<void>
  deleteProduct(productId: string): Promise<void>
  moveProduct(productId: string, direction: 'up' | 'down'): Promise<void>
  initializeDemoCatalog(): Promise<boolean>
  saveQuickExtras(list: ProductExtra[]): Promise<void>
  destroy?(): void
}

const STORAGE_KEY = 'comandero.catalog.v1'
const CHANNEL_NAME = 'comandero-catalog-sync'

export function buildDefaultCatalogState(): CatalogState {
  return buildDemoCatalogState()
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

function normalizeCategories(categories: CatalogCategory[]) {
  return [...categories]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((category, index) => ({
      ...category,
      subtitle: category.subtitle ?? '',
      emoji: category.emoji || 'TAG',
      sortOrder: index,
      isActive: category.isActive ?? true,
      isVisible: category.isVisible ?? true,
    }))
}

function normalizeProducts(products: Product[]) {
  return [...products]
    .map((product) => ({
      ...product,
      description: product.description ?? '',
      image: product.image || '🍔',
      extras: Array.isArray(product.extras) ? product.extras : [],
      options: Array.isArray(product.options) ? product.options : [],
      availability: product.availability ?? 'available',
      sortOrder: Number(product.sortOrder ?? 0),
      isActive: product.isActive ?? true,
      isVisible: product.isVisible ?? true,
    }))
}

function normalizeCatalogState(state: CatalogState): CatalogState {
  return {
    categories: normalizeCategories(Array.isArray(state.categories) ? state.categories : []),
    products: normalizeProducts(Array.isArray(state.products) ? state.products : []),
    lastUpdatedAt: state.lastUpdatedAt ?? Date.now(),
  }
}

function readStoredCatalogState(): CatalogState {
  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return buildDefaultCatalogState()
  }

  try {
    return normalizeCatalogState(JSON.parse(raw) as CatalogState)
  } catch {
    return buildDefaultCatalogState()
  }
}

function updateCategoryOrder(categories: CatalogCategory[]) {
  return categories.map((category, index) => ({
    ...category,
    sortOrder: index,
  }))
}

function updateProductOrder(products: Product[]) {
  return products.map((product, index) => ({
    ...product,
    sortOrder: index,
  }))
}

function moveItem<T extends { id: string }>(items: T[], itemId: string, direction: 'up' | 'down') {
  const index = items.findIndex((item) => item.id === itemId)

  if (index === -1) {
    return items
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1

  if (targetIndex < 0 || targetIndex >= items.length) {
    return items
  }

  const nextItems = [...items]
  const [item] = nextItems.splice(index, 1)
  nextItems.splice(targetIndex, 0, item)
  return nextItems
}

export function createLocalCatalogRepository(): CatalogRepository {
  const broadcastChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
  const statusListeners = new Set<() => void>()
  let currentState = readStoredCatalogState()
  let status = createRepositoryStatus('local', {
    source: 'local',
    detail: 'Catalogo local activo. Los cambios se guardan en este dispositivo.',
    hasPendingWrites: false,
  })

  const emit = () => {
    window.dispatchEvent(new CustomEvent('comandero:catalog-update'))
    broadcastChannel?.postMessage({ type: 'sync' })
  }

  const emitStatus = () => {
    statusListeners.forEach((listener) => listener())
  }

  const persist = (state: CatalogState) => {
    currentState = normalizeCatalogState({
      ...state,
      lastUpdatedAt: Date.now(),
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState))
    emit()
  }

  return {
    read() {
      return currentState
    },
    save(state) {
      persist(state)
    },
    subscribe(listener) {
      const syncFromStorage = () => {
        currentState = readStoredCatalogState()
        listener()
      }

      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) {
          syncFromStorage()
        }
      }

      window.addEventListener('storage', onStorage)
      window.addEventListener('comandero:catalog-update', syncFromStorage)
      broadcastChannel?.addEventListener('message', syncFromStorage)

      return () => {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('comandero:catalog-update', syncFromStorage)
        broadcastChannel?.removeEventListener('message', syncFromStorage)
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
            ? 'Catalogo local activo. Los cambios se guardan en este dispositivo.'
            : 'Sin internet, pero el catalogo local sigue disponible.',
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
    async createCategory(input) {
      const categories = [...currentState.categories, {
        id: crypto.randomUUID(),
        name: input.name,
        subtitle: input.subtitle ?? '',
        emoji: input.emoji,
        sortOrder: currentState.categories.length,
        isActive: true,
        isVisible: true,
      }]
      persist({ ...currentState, categories: updateCategoryOrder(categories) })
    },
    async updateCategory(categoryId, updates) {
      persist({
        ...currentState,
        categories: currentState.categories.map((category) =>
          category.id === categoryId
            ? {
                ...category,
                ...updates,
              }
            : category,
        ),
      })
    },
    async setCategoryVisibility(categoryId, isVisible) {
      persist({
        ...currentState,
        categories: currentState.categories.map((category) => (category.id === categoryId ? { ...category, isVisible } : category)),
      })
    },
    async setCategoryActive(categoryId, isActive) {
      persist({
        ...currentState,
        categories: currentState.categories.map((category) => (category.id === categoryId ? { ...category, isActive } : category)),
      })
    },
    async deleteCategory(categoryId) {
      const nextCategories = updateCategoryOrder(currentState.categories.filter((category) => category.id !== categoryId))
      const nextProducts = currentState.products.filter((product) => product.categoryId !== categoryId)
      persist({ ...currentState, categories: nextCategories, products: nextProducts })
    },
    async moveCategory(categoryId, direction) {
      persist({
        ...currentState,
        categories: updateCategoryOrder(moveItem(currentState.categories, categoryId, direction)),
      })
    },
    async createProduct(input) {
      const categoryProducts = currentState.products.filter((product) => product.categoryId === input.categoryId)

      const nextProduct: Product = {
        id: crypto.randomUUID(),
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? '',
        price: input.price,
        image: input.image,
        badge: input.badge,
        availability: 'available',
        sortOrder: categoryProducts.length,
        isActive: true,
        isVisible: true,
        extras: input.extras ?? [],
        options: input.options ?? [],
      }

      persist({
        ...currentState,
        products: normalizeProducts([...currentState.products, nextProduct]),
      })
    },
    async updateProduct(productId, updates) {
      const productToUpdate = currentState.products.find((product) => product.id === productId)

      if (!productToUpdate) {
        return
      }

      const nextCategoryId = updates.categoryId ?? productToUpdate.categoryId
      const nextSortOrder =
        nextCategoryId !== productToUpdate.categoryId
          ? currentState.products.filter((product) => product.categoryId === nextCategoryId).length
          : productToUpdate.sortOrder

      persist({
        ...currentState,
        products: currentState.products.map((product) =>
          product.id === productId
            ? {
                ...product,
                ...updates,
                categoryId: nextCategoryId,
                sortOrder: nextSortOrder,
                extras: updates.extras ?? product.extras,
                options: updates.options ?? product.options,
              }
            : product,
        ),
      })
    },
    async setProductVisibility(productId, isVisible) {
      persist({
        ...currentState,
        products: currentState.products.map((product) => (product.id === productId ? { ...product, isVisible } : product)),
      })
    },
    async setProductActive(productId, isActive) {
      persist({
        ...currentState,
        products: currentState.products.map((product) => (product.id === productId ? { ...product, isActive } : product)),
      })
    },
    async setProductAvailability(productId, availability) {
      persist({
        ...currentState,
        products: currentState.products.map((product) => (product.id === productId ? { ...product, availability } : product)),
      })
    },
    async deleteProduct(productId) {
      const product = currentState.products.find((entry) => entry.id === productId)

      if (!product) {
        return
      }

      const sameCategory = currentState.products
        .filter((entry) => entry.categoryId === product.categoryId && entry.id !== productId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
      const otherProducts = currentState.products.filter((entry) => entry.categoryId !== product.categoryId)

      persist({
        ...currentState,
        products: [...otherProducts, ...updateProductOrder(sameCategory)],
      })
    },
    async moveProduct(productId, direction) {
      const product = currentState.products.find((entry) => entry.id === productId)

      if (!product) {
        return
      }

      const sameCategory = currentState.products
        .filter((entry) => entry.categoryId === product.categoryId)
        .sort((left, right) => left.sortOrder - right.sortOrder)

      const movedCategoryProducts = updateProductOrder(moveItem(sameCategory, productId, direction))
      const otherProducts = currentState.products.filter((entry) => entry.categoryId !== product.categoryId)

      persist({
        ...currentState,
        products: normalizeProducts([...otherProducts, ...movedCategoryProducts]),
      })
    },
    async initializeDemoCatalog() {
      persist({
        categories: demoCategories,
        products: demoProducts,
        quickExtras: demoQuickExtras,
        lastUpdatedAt: Date.now(),
      })

      return true
    },
    async saveQuickExtras(list) {
      persist({
        ...currentState,
        quickExtras: list,
        lastUpdatedAt: Date.now(),
      })
    },
  }
}

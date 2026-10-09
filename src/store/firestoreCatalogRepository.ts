import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { demoCategories, demoProducts, demoQuickExtras } from '../data/catalog'
import { getFirebaseContext } from '../lib/firebase'
import type {
  CatalogCategory,
  CatalogCategoryInput,
  CatalogProductInput,
  CatalogState,
  Product,
  RepositoryStatus,
  ProductExtra,
} from '../types'
import { buildDefaultCatalogState, createRepositoryStatus, type CatalogRepository } from './catalogRepository'

type Listener = () => void

const REMOVED_EXTRA_NAMES = new Set(['salsa golf', 'salsa bbq'])

function isRemovedExtra(extra: { name?: unknown }): boolean {
  return REMOVED_EXTRA_NAMES.has(String(extra?.name ?? '').toLowerCase())
}

function normalizeCategory(id: string, data: DocumentData): CatalogCategory {
  return {
    id,
    name: String(data.name ?? 'Categoria'),
    subtitle: String(data.subtitle ?? ''),
    emoji: String(data.emoji ?? 'TAG'),
    sortOrder: Number(data.sortOrder ?? 0),
    isActive: Boolean(data.isActive ?? true),
    isVisible: Boolean(data.isVisible ?? true),
  }
}

function normalizeProduct(id: string, data: DocumentData): Product {
  return {
    id,
    categoryId: String(data.categoryId ?? ''),
    name: String(data.name ?? 'Producto'),
    description: String(data.description ?? ''),
    price: Number(data.price ?? 0),
    image: String(data.image ?? '🍔'),
    badge: typeof data.badge === 'string' ? data.badge : undefined,
    availability: data.availability === 'soldout' ? 'soldout' : 'available',
    sortOrder: Number(data.sortOrder ?? 0),
    isActive: Boolean(data.isActive ?? true),
    isVisible: Boolean(data.isVisible ?? true),
    extras: Array.isArray(data.extras) ? data.extras.filter((extra) => !isRemovedExtra(extra)) : [],
    options: Array.isArray(data.options) ? data.options : [],
  }
}

export class FirestoreCatalogRepository implements CatalogRepository {
  private state: CatalogState = buildDefaultCatalogState()
  private status: RepositoryStatus = createRepositoryStatus('connecting', {
    source: 'firebase',
    detail: 'Inicializando catalogo...',
    hasPendingWrites: false,
  })
  private readonly listeners = new Set<Listener>()
  private readonly statusListeners = new Set<Listener>()
  private pendingOperations = 0
  private started = false
  private lastCategoriesFromCache = true
  private lastProductsFromCache = true
  private unsubscribeCategories: Unsubscribe | null = null
  private unsubscribeProducts: Unsubscribe | null = null
  private unsubscribeQuickExtras: Unsubscribe | null = null

  constructor() {
    window.addEventListener('online', this.handleNetworkChange)
    window.addEventListener('offline', this.handleNetworkChange)
    void this.start()
  }

  read() {
    return this.state
  }

  save(state: CatalogState) {
    this.state = state
    this.emitState()
  }

  destroy() {
    this.unsubscribeCategories?.()
    this.unsubscribeProducts?.()
    this.unsubscribeQuickExtras?.()
    this.unsubscribeCategories = null
    this.unsubscribeProducts = null
    this.unsubscribeQuickExtras = null
    window.removeEventListener('online', this.handleNetworkChange)
    window.removeEventListener('offline', this.handleNetworkChange)
    this.listeners.clear()
    this.statusListeners.clear()
    this.started = false
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus() {
    return this.status
  }

  subscribeStatus(listener: Listener) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  async createCategory(input: CatalogCategoryInput) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const categoriesRef = collection(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories')
    const categoryRef = doc(categoriesRef)

    await setDoc(categoryRef, {
      name: input.name,
      subtitle: input.subtitle ?? '',
      emoji: input.emoji,
      sortOrder: this.state.categories.length,
      isActive: true,
      isVisible: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  }

  async updateCategory(categoryId: string, updates: Partial<CatalogCategoryInput>) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    await updateDoc(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories', categoryId), {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  }

  async setCategoryVisibility(categoryId: string, isVisible: boolean) {
    await this.updateCategoryFlags(categoryId, { isVisible })
  }

  async setCategoryActive(categoryId: string, isActive: boolean) {
    await this.updateCategoryFlags(categoryId, { isActive })
  }

  async deleteCategory(categoryId: string) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const batch = writeBatch(firebase.db)
    batch.delete(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories', categoryId))
    this.state.products
      .filter((product) => product.categoryId === categoryId)
      .forEach((product) => {
        batch.delete(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', product.id))
      })
    await batch.commit()
  }

  async moveCategory(categoryId: string, direction: 'up' | 'down') {
    const ordered = [...this.state.categories].sort((left, right) => left.sortOrder - right.sortOrder)
    const index = ordered.findIndex((category) => category.id === categoryId)
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
      return
    }

    const next = [...ordered]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    await this.persistCategoryOrder(next)
  }

  async createProduct(input: CatalogProductInput) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const categoryProducts = this.state.products.filter((product) => product.categoryId === input.categoryId)
    const productsRef = collection(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products')
    const productRef = doc(productsRef)

    await setDoc(productRef, {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? '',
      price: input.price,
      image: input.image,
      badge: input.badge ?? '',
      extras: input.extras ?? [],
      options: input.options ?? [],
      availability: 'available',
      sortOrder: categoryProducts.length,
      isActive: true,
      isVisible: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  }

  async updateProduct(productId: string, updates: Partial<CatalogProductInput>) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const currentProduct = this.state.products.find((product) => product.id === productId)
    const nextCategoryId = updates.categoryId ?? currentProduct?.categoryId
    const nextSortOrder =
      currentProduct && nextCategoryId && nextCategoryId !== currentProduct.categoryId
        ? this.state.products.filter((product) => product.categoryId === nextCategoryId).length
        : currentProduct?.sortOrder

    await updateDoc(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', productId), {
      ...updates,
      ...(typeof nextSortOrder === 'number' ? { sortOrder: nextSortOrder } : {}),
      updatedAt: serverTimestamp(),
    })
  }

  async setProductVisibility(productId: string, isVisible: boolean) {
    await this.updateProductFlags(productId, { isVisible })
  }

  async setProductActive(productId: string, isActive: boolean) {
    await this.updateProductFlags(productId, { isActive })
  }

  async setProductAvailability(productId: string, availability: Product['availability']) {
    await this.updateProductFlags(productId, { availability })
  }

  async deleteProduct(productId: string) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    await deleteDoc(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', productId))
  }

  async moveProduct(productId: string, direction: 'up' | 'down') {
    const product = this.state.products.find((entry) => entry.id === productId)

    if (!product) {
      return
    }

    const sameCategory = this.state.products
      .filter((entry) => entry.categoryId === product.categoryId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
    const index = sameCategory.findIndex((entry) => entry.id === productId)
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (index < 0 || targetIndex < 0 || targetIndex >= sameCategory.length) {
      return
    }

    const next = [...sameCategory]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    await this.persistProductOrder(next)
  }

  async initializeDemoCatalog() {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const batch = writeBatch(firebase.db)

    this.state.categories.forEach((category) => {
      batch.delete(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories', category.id))
    })

    this.state.products.forEach((product) => {
      batch.delete(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', product.id))
    })

    demoCategories.forEach((category) => {
      batch.set(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories', category.id), {
        name: category.name,
        subtitle: category.subtitle ?? '',
        emoji: category.emoji,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        isVisible: category.isVisible,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    })

    demoProducts.forEach((product) => {
      batch.set(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', product.id), {
        categoryId: product.categoryId,
        name: product.name,
        description: product.description ?? '',
        price: product.price,
        image: product.image,
        badge: product.badge ?? '',
        extras: product.extras ?? [],
        options: product.options ?? [],
        availability: product.availability,
        sortOrder: product.sortOrder,
        isActive: product.isActive,
        isVisible: product.isVisible,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    })

    await batch.commit()
    return true
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

      const categoriesRef = collection(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories')
      const productsRef = collection(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products')

      this.unsubscribeCategories = onSnapshot(
        query(categoriesRef, orderBy('sortOrder', 'asc')),
        { includeMetadataChanges: true },
        (snapshot) => this.handleCategoriesSnapshot(snapshot),
        (error) => this.handleSnapshotError(error),
      )

      this.unsubscribeProducts = onSnapshot(
        query(productsRef, orderBy('sortOrder', 'asc')),
        { includeMetadataChanges: true },
        (snapshot) => this.handleProductsSnapshot(snapshot),
        (error) => this.handleSnapshotError(error),
      )

      const quickExtrasDoc = doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'settings', 'quick_extras')
      this.unsubscribeQuickExtras = onSnapshot(
        quickExtrasDoc,
        { includeMetadataChanges: true },
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data()
            const rawList = Array.isArray(data.list) ? data.list : demoQuickExtras
            this.state = {
              ...this.state,
              quickExtras: rawList.filter((extra: ProductExtra) => !isRemovedExtra(extra)),
              lastUpdatedAt: Date.now(),
            }
          } else {
            this.state = {
              ...this.state,
              quickExtras: demoQuickExtras.filter((extra) => !isRemovedExtra(extra)),
              lastUpdatedAt: Date.now(),
            }
          }
          this.emitState()
        },
        (error) => this.handleSnapshotError(error),
      )
    } catch (error) {
      this.handleSnapshotError(error as FirestoreError)
    }
  }

  private handleCategoriesSnapshot(snapshot: QuerySnapshot<DocumentData>) {
    this.state = {
      ...this.state,
      categories: snapshot.docs.map((entry) => normalizeCategory(entry.id, entry.data())),
      lastUpdatedAt: Date.now(),
    }
    this.lastCategoriesFromCache = snapshot.metadata.fromCache
    this.emitState()
    this.refreshStatus('Catalogo sincronizado.')
  }

  private handleProductsSnapshot(snapshot: QuerySnapshot<DocumentData>) {
    this.state = {
      ...this.state,
      products: snapshot.docs.map((entry) => normalizeProduct(entry.id, entry.data())),
      lastUpdatedAt: Date.now(),
    }
    this.lastProductsFromCache = snapshot.metadata.fromCache
    this.emitState()
    this.refreshStatus('Catalogo sincronizado.')
  }

  private async updateCategoryFlags(categoryId: string, updates: Record<string, unknown>) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    await updateDoc(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories', categoryId), {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  }

  private async updateProductFlags(productId: string, updates: Record<string, unknown>) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    await updateDoc(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', productId), {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  }

  private async persistCategoryOrder(categories: CatalogCategory[]) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const batch = writeBatch(firebase.db)
    categories.forEach((category, index) => {
      batch.update(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'categories', category.id), {
        sortOrder: index,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }

  private async persistProductOrder(products: Product[]) {
    const firebase = await getFirebaseContext()

    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }

    const batch = writeBatch(firebase.db)
    products.forEach((product, index) => {
      batch.update(doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'products', product.id), {
        sortOrder: index,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }

  private handleSnapshotError(error: FirestoreError) {
    this.setStatus(
      createRepositoryStatus('offline', {
        source: 'firebase',
        detail: `Sin acceso al catalogo: ${error.message}`,
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
    } else if (this.pendingOperations > 0 || this.lastCategoriesFromCache || this.lastProductsFromCache) {
      mode = 'connecting'
    } else {
      mode = 'connected'
    }

    this.setStatus(
      createRepositoryStatus(mode, {
        source: 'firebase',
        detail:
          mode === 'offline'
            ? 'Sin internet. Se mostrara la ultima version disponible del catalogo.'
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

  async saveQuickExtras(list: ProductExtra[]) {
    const firebase = await getFirebaseContext()
    if (!firebase) {
      throw new Error('Firebase no esta configurado.')
    }
    const quickExtrasDoc = doc(firebase.db, 'restaurants', firebase.restaurantId, 'catalog', 'current', 'settings', 'quick_extras')
    await setDoc(quickExtrasDoc, {
      list,
      updatedAt: serverTimestamp(),
    })
  }
}

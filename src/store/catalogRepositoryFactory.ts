import { getAuthMode } from './authStore'
import { createLocalCatalogRepository, type CatalogRepository } from './catalogRepository'
import { FirestoreCatalogRepository } from './firestoreCatalogRepository'

let repository: CatalogRepository | null = null

export function getCatalogRepository() {
  if (!repository) {
    repository = getAuthMode() === 'firebase' ? (new FirestoreCatalogRepository() as CatalogRepository) : createLocalCatalogRepository()
  }

  return repository
}

export function resetCatalogRepository() {
  repository?.destroy?.()
  repository = null
}

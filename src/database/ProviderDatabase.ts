import {
  deleteProvider as _deleteProvider,
  getAllProviders as _getAllProviders,
  getProviderById as _getProviderById,
  getProviderByIdSync as _getProviderByIdSync,
  upsertProviders as _upsertProviders
} from '@db/queries/providers.queries'

import type { Provider } from '@/types/assistant'

export async function upsertProviders(providers: Provider[]) {
  return _upsertProviders(providers)
}

export async function deleteProvider(providerId: string) {
  return _deleteProvider(providerId)
}

export async function getProviderById(providerId: string) {
  return _getProviderById(providerId)
}

export async function getAllProviders() {
  return _getAllProviders()
}

export function getProviderByIdSync(providerId: string) {
  return _getProviderByIdSync(providerId)
}

export const providerDatabase = {
  upsertProviders,
  deleteProvider,
  getProviderById,
  getAllProviders,
  getProviderByIdSync
}

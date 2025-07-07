import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'

import { WebSearchProvider } from '@/types/websearch'

import { db } from '../../db'
import { transformDbToWebSearchProvider, upsertWebSearchProviders } from '../../db/queries/providers.queries'
import { websearch_providers } from '../../db/schema'

export function useWebsearchProviders() {
  const query = db.select().from(websearch_providers)
  const { data: rawProviders, updatedAt } = useLiveQuery(query)

  if (!updatedAt) {
    return {
      freeProviders: [],
      apiProviders: [],
      isLoading: true
    }
  }

  const processedProviders = rawProviders.map(provider => transformDbToWebSearchProvider(provider))
  const freeProviders = processedProviders.filter(provider => provider.id.startsWith('local-'))
  const apiProviders = processedProviders.filter(
    provider => !provider.id.startsWith('local-') && provider.id !== 'searxng'
  )

  return {
    freeProviders,
    apiProviders,
    isLoading: false
  }
}

/**
 * Fetch all web search providers from the database.
 */
export function useAllWebSearchProviders() {
  const query = db.select().from(websearch_providers)
  const { data: rawProviders, updatedAt } = useLiveQuery(query)

  if (!updatedAt) {
    return {
      providers: [],
      isLoading: true
    }
  }

  const processedProviders = rawProviders.map(provider => transformDbToWebSearchProvider(provider))
  return {
    providers: processedProviders,
    isLoading: false
  }
}

/**
 * Fetch a web search provider by its ID.
 * @param providerId
 */
export function useWebSearchProvider(providerId: string) {
  console.log('useWebSearchProvider', providerId)
  const query = db.select().from(websearch_providers).where(eq(websearch_providers.id, providerId))
  const { data: rawProvider, updatedAt } = useLiveQuery(query)

  const updateProvider = async (provider: WebSearchProvider) => {
    await upsertWebSearchProviders([provider])
  }

  if (!updatedAt) {
    return {
      provider: null,
      isLoading: true,
      updateProvider
    }
  }

  const provider = transformDbToWebSearchProvider(rawProvider[0])
  return {
    provider,
    isLoading: false,
    updateProvider
  }
}

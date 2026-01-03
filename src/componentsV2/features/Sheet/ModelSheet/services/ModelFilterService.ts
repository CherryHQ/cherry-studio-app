import { isEmbeddingModel, isRerankModel } from '@/config/models'
import type { Model } from '@/types/assistant'

/**
 * Filter function type for models
 */
export type ModelFilterFn = (model: Model) => boolean

/**
 * Predefined filter strategies
 */
export const filters = {
  excludeEmbedding: (model: Model) => !isEmbeddingModel(model),
  excludeRerank: (model: Model) => !isRerankModel(model),
  excludeNonChat: (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model),
  all: () => true
} as const

/**
 * Compose multiple filter functions into one
 * All filters must pass for the model to be included
 */
export function composeFilters(...filterFns: ModelFilterFn[]): ModelFilterFn {
  return (model: Model) => filterFns.every(fn => fn(model))
}

/**
 * Default filter used by ModelSheet
 * Excludes embedding and rerank models
 */
export const defaultModelFilter = composeFilters(filters.excludeEmbedding, filters.excludeRerank)

/**
 * Factory function for creating custom model filters
 */
export function createModelFilter(options: {
  excludeTypes?: ('embedding' | 'rerank')[]
  includeProviders?: string[]
  excludeProviders?: string[]
  customPredicate?: ModelFilterFn
}): ModelFilterFn {
  const predicates: ModelFilterFn[] = []

  if (options.excludeTypes?.includes('embedding')) {
    predicates.push(filters.excludeEmbedding)
  }
  if (options.excludeTypes?.includes('rerank')) {
    predicates.push(filters.excludeRerank)
  }
  if (options.includeProviders) {
    const providers = options.includeProviders
    predicates.push(model => providers.includes(model.provider))
  }
  if (options.excludeProviders) {
    const providers = options.excludeProviders
    predicates.push(model => !providers.includes(model.provider))
  }
  if (options.customPredicate) {
    predicates.push(options.customPredicate)
  }

  return predicates.length > 0 ? composeFilters(...predicates) : filters.all
}

/**
 * Check if a model matches a search query
 * Matches against model ID and name (case-insensitive)
 */
export function matchesSearchQuery(model: Model, modelUniqId: string, query: string): boolean {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const modelId = modelUniqId.toLowerCase()
  const modelName = model.name.toLowerCase()
  return modelId.includes(lowerQuery) || modelName.includes(lowerQuery)
}

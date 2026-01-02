import type { TFunction } from 'i18next'
import { sortBy } from 'lodash'

import { isEmbeddingModel, isRerankModel } from '@/config/models'
import type { Model, Provider } from '@/types/assistant'
import { getModelUniqId } from '@/utils/model'

import type { ModelOption, ProviderSection, SelectOption } from './types'

/**
 * Check if a model should be included in the model sheet.
 * Excludes embedding and rerank models.
 */
export function shouldIncludeModel(model: Model): boolean {
  return !isEmbeddingModel(model) && !isRerankModel(model)
}

/**
 * Filter models by search query.
 * Matches against model id and name (case insensitive).
 */
export function filterModels(models: Model[], searchQuery: string): Model[] {
  if (!searchQuery) return models

  const query = searchQuery.toLowerCase()
  return models.filter(model => {
    const modelId = getModelUniqId(model).toLowerCase()
    const modelName = model.name.toLowerCase()
    return modelId.includes(query) || modelName.includes(query)
  })
}

/**
 * Filter providers that should be shown in the model sheet.
 * Includes cherryai provider and enabled providers with models.
 */
export function filterValidProviders(providers: Provider[]): Provider[] {
  return providers.filter(p => p.id === 'cherryai' || (p.models && p.models.length > 0 && p.enabled))
}

/**
 * Convert a Model to a ModelOption for display.
 */
export function modelToOption(model: Model): ModelOption {
  return {
    label: model.name,
    value: getModelUniqId(model),
    model
  }
}

/**
 * Build SelectOption array from providers.
 * Handles provider filtering, model filtering, and search.
 */
export function buildSelectOptions(
  providers: Provider[],
  searchQuery: string,
  t: TFunction
): SelectOption[] {
  return filterValidProviders(providers)
    .map(provider => {
      const filteredModels = filterModels(
        sortBy(provider.models, 'name').filter(shouldIncludeModel),
        searchQuery
      )

      return {
        label: provider.isSystem ? t(`provider.${provider.id}`) : provider.name,
        title: provider.name,
        provider,
        options: filteredModels.map(modelToOption)
      }
    })
    .filter(group => group.options.length > 0)
}

/**
 * Build ProviderSection array from SelectOptions for SectionList.
 */
export function buildSections(selectOptions: SelectOption[]): ProviderSection[] {
  return selectOptions.map(group => ({
    key: group.provider.id,
    title: group.label,
    provider: group.provider,
    data: group.options
  }))
}

/**
 * Get all model options from select options (flattened).
 */
export function getAllModelOptions(selectOptions: SelectOption[]): ModelOption[] {
  return selectOptions.flatMap(group => group.options)
}

/**
 * Map mentions (Model[]) to selection (string[] of model values).
 */
export function mapMentionsToSelection(mentions: Model[]): string[] {
  return mentions.map(m => getModelUniqId(m))
}

/**
 * Map selection (string[] of model values) back to mentions (Model[]).
 */
export function mapSelectionToMentions(selection: string[], allModelOptions: ModelOption[]): Model[] {
  return allModelOptions.filter(option => selection.includes(option.value)).map(option => option.model)
}

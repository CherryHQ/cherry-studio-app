import { sortBy } from 'lodash'
import { useTranslation } from 'react-i18next'

import { useAllProviders } from '@/hooks/useProviders'
import { getModelUniqId } from '@/utils/model'

import { defaultModelFilter, matchesSearchQuery, type ModelFilterFn } from '../services/ModelFilterService'
import type { ModelOption, ProviderSection, SelectOption } from '../types'

interface UseModelOptionsParams {
  searchQuery: string
  filterFn?: ModelFilterFn
}

interface UseModelOptionsResult {
  selectOptions: SelectOption[]
  allModelOptions: ModelOption[]
  sections: ProviderSection[]
}

/**
 * Hook for transforming provider data into model options
 * Handles filtering, searching, and grouping by provider
 */
export function useModelOptions({
  searchQuery,
  filterFn = defaultModelFilter
}: UseModelOptionsParams): UseModelOptionsResult {
  const { t } = useTranslation()
  const { providers } = useAllProviders()

  const providerOptions = providers
    .filter(p => p.id === 'cherryai' || (p.models && p.models.length > 0 && p.enabled))
    .map(p => {
      const allOptions = sortBy(p.models, 'name')
        .filter(filterFn)
        .map(m => ({
          label: m.name,
          value: getModelUniqId(m),
          model: m
        }))

      const visibleOptions = allOptions.filter(option => matchesSearchQuery(option.model, option.value, searchQuery))

      return {
        label: p.isSystem ? t(`provider.${p.id}`) : p.name,
        title: p.name,
        provider: p,
        allOptions,
        visibleOptions
      }
    })

  const selectOptions = providerOptions
    .filter(group => group.visibleOptions.length > 0)
    .map(group => ({
      label: group.label,
      title: group.title,
      provider: group.provider,
      options: group.visibleOptions
    }))

  const allModelOptions = providerOptions.flatMap(group => group.allOptions)

  const sections = selectOptions.map(group => ({
    title: group.label,
    provider: group.provider,
    data: group.options
  }))

  return { selectOptions, allModelOptions, sections }
}

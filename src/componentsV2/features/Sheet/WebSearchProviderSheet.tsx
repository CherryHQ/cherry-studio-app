import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { delay } from 'lodash'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import { Globe, WebsearchProviderIcon } from '@/componentsV2/icons'
import { isWebSearchModel } from '@/config/models'
import { useAllWebSearchProviders } from '@/hooks/useWebsearchProviders'
import type { Assistant, Model } from '@/types/assistant'

const SHEET_NAME = 'websearch-provider-sheet'

interface WebSearchProviderSheetData {
  mentions: Model[]
  assistant: Assistant | null
  updateAssistant: ((assistant: Assistant) => Promise<void>) | null
}

const defaultSheetData: WebSearchProviderSheetData = {
  mentions: [],
  assistant: null,
  updateAssistant: null
}

let currentSheetData: WebSearchProviderSheetData = defaultSheetData
let updateSheetDataCallback: ((data: WebSearchProviderSheetData) => void) | null = null

export const presentWebSearchProviderSheet = (data: WebSearchProviderSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissWebSearchProviderSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const WebSearchProviderSheet: React.FC = () => {
  const { t } = useTranslation()
  const [sheetData, setSheetData] = useState<WebSearchProviderSheetData>(currentSheetData)
  const { mentions, assistant, updateAssistant } = sheetData
  const { providers, isLoading } = useAllWebSearchProviders()

  const firstMention = mentions[0]
  const showBuiltinOption = !!firstMention && isWebSearchModel(firstMention)

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  // Filter to only show configured API providers (exclude free providers for now)
  const configuredProviders = useMemo(() => {
    return providers.filter(provider => {
      // Exclude free providers (local-google, local-bing, local-baidu) for now
      if (provider.id.startsWith('local-')) {
        return false
      }
      // Searxng requires apiHost to be configured
      if (provider.id === 'searxng') {
        return !!provider.apiHost
      }
      // API providers (tavily, exa, bocha) require apiKey
      if (provider.type === 'api') {
        return !!provider.apiKey
      }
      return false
    })
  }, [providers])

  const handleSelectProvider = async (providerId: string) => {
    if (!assistant || !updateAssistant) {
      return
    }

    await updateAssistant({
      ...assistant,
      enableWebSearch: true,
      webSearchProviderId: providerId
    })

    delay(() => dismissWebSearchProviderSheet(), 50)
  }

  const sheetOptions: SelectionSheetItem[] = useMemo(() => {
    const options: SelectionSheetItem[] = []

    // Add built-in option if model supports it
    if (showBuiltinOption) {
      options.push({
        key: 'builtin',
        label: t('settings.websearch.builtin'),
        icon: <Globe size={20} />,
        isSelected: assistant?.webSearchProviderId === 'builtin',
        onSelect: () => handleSelectProvider('builtin')
      })
    }

    // Add configured providers
    configuredProviders.forEach(provider => {
      options.push({
        key: provider.id,
        label: provider.name,
        icon: <WebsearchProviderIcon provider={provider} />,
        isSelected: assistant?.webSearchProviderId === provider.id,
        onSelect: () => handleSelectProvider(provider.id)
      })
    })

    return options
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBuiltinOption, configuredProviders, assistant?.webSearchProviderId, t, assistant, updateAssistant])

  if (isLoading) {
    return null
  }

  return (
    <SelectionSheet
      detents={['auto', 0.4]}
      name={SHEET_NAME}
      items={sheetOptions}
      placeholder={t('settings.websearch.change_provider')}
    />
  )
}

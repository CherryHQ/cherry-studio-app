import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import SelectionDropdown, { type SelectionDropdownItem } from '@/componentsV2/base/SelectionDropdown'
import Text from '@/componentsV2/base/Text'
import { ChevronRight, ChevronsUpDown, Globe, WebsearchProviderIcon } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import { isWebSearchModel } from '@/config/models'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'
import type { WebSearchProvider } from '@/types/websearch'

interface WebsearchDropdownProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  providers: WebSearchProvider[]
}

export function WebsearchDropdown({ assistant, updateAssistant, providers }: WebsearchDropdownProps) {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  const handleItemSelect = async (id: string) => {
    const newProviderId = id === assistant.webSearchProviderId ? undefined : id
    await updateAssistant({
      ...assistant,
      webSearchProviderId: newProviderId
    })
  }

  const handleBuiltinSelect = async () => {
    await updateAssistant({
      ...assistant,
      webSearchProviderId: 'builtin'
    })
  }

  const isWebSearchModelEnabled = assistant.model && isWebSearchModel(assistant.model)

  const websearchOptions: SelectionDropdownItem[] = [
    ...(isWebSearchModelEnabled
      ? [
          {
            id: 'builtin',
            label: t('settings.websearch.builtin'),
            icon: <Globe size={20} />,
            isSelected: assistant.webSearchProviderId === 'builtin',
            onSelect: () => handleBuiltinSelect()
          }
        ]
      : []),
    ...providers.map(p => ({
      id: p.id,
      label: p.name,
      icon: <WebsearchProviderIcon provider={p} />,
      isSelected: assistant.webSearchProviderId === p.id,
      onSelect: () => handleItemSelect(p.id)
    }))
  ]

  const provider = providers.find(p => p.id === assistant.webSearchProviderId)

  const getDisplayContent = () => {
    if (provider) {
      return {
        icon: <WebsearchProviderIcon provider={provider} />,
        text: provider.name,
        isActive: true
      }
    }

    if (assistant.webSearchProviderId === 'builtin') {
      return {
        icon: <Globe size={18} />,
        text: t('settings.websearch.builtin'),
        isActive: true
      }
    }

    return {
      icon: null,
      text: t('settings.websearch.empty.label'),
      isActive: false
    }
  }

  const displayContent = getDisplayContent()

  // If no providers available, show a pressable that navigates to settings
  if (websearchOptions.length === 0) {
    return (
      <Pressable
        onPress={() => navigation.navigate('Home', { screen: 'WebSearchSettings' })}
        className="bg-card flex-row items-center gap-2 rounded-xl active:opacity-80">
        <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
          {t('settings.websearch.empty.description')}
        </Text>
        <ChevronRight size={16} className="text-foreground-secondary " />
      </Pressable>
    )
  }

  return (
    <SelectionDropdown items={websearchOptions}>
      <Pressable className="bg-card flex-row items-center gap-2 rounded-xl active:opacity-80">
        {displayContent.isActive ? (
          <XStack className="items-center gap-2">
            {displayContent.icon}
            <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
              {displayContent.text}
            </Text>
          </XStack>
        ) : (
          <Text className="text-foreground-secondary text-sm" numberOfLines={1}>
            {displayContent.text}
          </Text>
        )}
        <ChevronsUpDown size={16} className="text-foreground-secondary " />
      </Pressable>
    </SelectionDropdown>
  )
}

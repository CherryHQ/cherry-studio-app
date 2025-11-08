import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { delay } from 'lodash'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity } from 'react-native'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import Text from '@/componentsV2/base/Text'
import { Globe, WebsearchProviderIcon } from '@/componentsV2/icons'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import { isWebSearchModel } from '@/config/models'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'
import type { WebSearchProvider } from '@/types/websearch'

interface WebsearchSheetProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  providers: WebSearchProvider[]
  ref: React.RefObject<BottomSheetModal | null>
}

export const WebsearchSheet: FC<WebsearchSheetProps> = ({ providers, assistant, updateAssistant, ref }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()

  const handleItemSelect = async (id: string) => {
    const newProviderId = id === assistant.webSearchProviderId ? undefined : id
    await updateAssistant({
      ...assistant,
      webSearchProviderId: newProviderId
    })
    delay(() => ref.current?.dismiss(), 50)
  }

  const handleBuiltinSelect = async () => {
    await updateAssistant({
      ...assistant,
      webSearchProviderId: 'builtin'
    })
    delay(() => ref.current?.dismiss(), 50)
  }

  const handleNavigateToWebSearhPage = () => {
    ref.current?.dismiss()
    navigation.navigate('Home', { screen: 'WebSearchSettings' })
  }

  const isWebSearchModelEnabled = assistant.model && isWebSearchModel(assistant.model)

  const providerItems: SelectionSheetItem[] = [
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

  const emptyContent = (
    <TouchableOpacity onPress={handleNavigateToWebSearhPage} activeOpacity={0.7}>
      <XStack className="bg-card w-full items-center gap-2.5 rounded-md px-5 py-4">
        <Text className="text-foreground flex-1 text-base">{t('settings.websearch.empty.label')}</Text>
        <XStack className="items-center gap-1.5">
          <Text className="text-[11px] opacity-40">{t('settings.websearch.empty.description')}</Text>
          <RowRightArrow />
        </XStack>
      </XStack>
    </TouchableOpacity>
  )

  return <SelectionSheet items={providerItems} ref={ref} emptyContent={emptyContent} />
}

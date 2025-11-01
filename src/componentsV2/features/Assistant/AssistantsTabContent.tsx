import { LegendList } from '@legendapp/list'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text, YStack } from '@/componentsV2'
import type { Assistant } from '@/types/assistant'

import AssistantItemCard from './AssistantItemCard'

interface AssistantsTabProps {
  assistants: Assistant[]
  onAssistantPress: (assistant: Assistant) => void
  numColumns?: number
  estimatedItemSize?: number
}

const AssistantsTabContent: React.FC<AssistantsTabProps> = ({ assistants, onAssistantPress, numColumns = 2 }) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const renderItem = useCallback(
    ({ item }: { item: Assistant }) => <AssistantItemCard assistant={item} onAssistantPress={onAssistantPress} />,
    [onAssistantPress]
  )

  if (!assistants || assistants.length === 0) {
    return (
      <YStack className="flex-1 items-center justify-center p-5">
        <Text className="text-base text-gray-60 dark:text-gray-60">{t('assistants.market.empty_state')}</Text>
      </YStack>
    )
  }

  return (
    <YStack className="flex-1">
      <LegendList
        data={assistants}
        renderItem={renderItem}
        numColumns={numColumns}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        recycleItems
        drawDistance={100}
        estimatedItemSize={230}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
      />
    </YStack>
  )
}

export default AssistantsTabContent

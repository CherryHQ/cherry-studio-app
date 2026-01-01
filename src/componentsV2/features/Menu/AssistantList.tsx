import { FlashList } from '@shopify/flash-list'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import Text from '@/componentsV2/base/Text'
import EmojiAvatar from '@/componentsV2/features/Assistant/EmojiAvatar'
import PressableRow from '@/componentsV2/layout/PressableRow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { useTopicCount } from '@/hooks/useTopicCount'
import type { Assistant } from '@/types/assistant'

interface AssistantListProps {
  assistants: Assistant[]
  isLoading?: boolean
  onAssistantPress: (assistant: Assistant) => void
}

interface AssistantListItemProps {
  assistant: Assistant
  onPress: (assistant: Assistant) => void
}

// Assistant list item component to properly use hooks
function AssistantListItem({ assistant, onPress }: AssistantListItemProps) {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const topicCount = useTopicCount(assistant.id)

  return (
    <PressableRow className="flex-row items-center justify-between rounded-xl p-0" onPress={() => onPress(assistant)}>
      <XStack className="flex-1 items-center gap-3 pr-3">
        <EmojiAvatar
          emoji={assistant.emoji}
          size={46}
          borderRadius={18}
          borderWidth={3}
          borderColor={isDark ? '#333333' : '#f7f7f7'}
        />
        <YStack className="flex-1 gap-0.5">
          <Text className="font-bold" numberOfLines={1} ellipsizeMode="tail">
            {assistant.name}
          </Text>
          <Text ellipsizeMode="tail" numberOfLines={1} className="text-foreground-secondary text-xs">
            {t('assistants.topics.count', { count: topicCount })}
          </Text>
        </YStack>
      </XStack>
    </PressableRow>
  )
}

export function AssistantList({ assistants, isLoading = false, onAssistantPress }: AssistantListProps) {
  const { t } = useTranslation()

  // Filter out translate and quick assistants
  const filteredAssistants = assistants.filter(assistant => assistant.id !== 'translate' && assistant.id !== 'quick')

  if (isLoading) {
    return (
      <YStack className="min-h-[200px] flex-1 items-center justify-center px-5 pb-5">
        <ActivityIndicator />
      </YStack>
    )
  }

  return (
    <YStack className="flex-1 px-5">
      <FlashList
        data={filteredAssistants}
        renderItem={({ item }) => <AssistantListItem assistant={item} onPress={onAssistantPress} />}
        keyExtractor={item => item.id}
        ItemSeparatorComponent={() => <YStack className="h-4" />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <YStack className="flex-1 items-center justify-center py-5">
            <Text className="text-foreground-secondary text-sm">{t('settings.assistant.empty')}</Text>
          </YStack>
        )}
      />
    </YStack>
  )
}

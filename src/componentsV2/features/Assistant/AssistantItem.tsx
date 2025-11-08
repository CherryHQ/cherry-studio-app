import { useNavigation } from '@react-navigation/native'
import { isEmpty } from 'lodash'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ContextMenuListProps } from '@/componentsV2/base/ContextMenu'
import ContextMenu from '@/componentsV2/base/ContextMenu'
import Text from '@/componentsV2/base/Text'
import { Trash2 } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { getCurrentTopicId } from '@/hooks/useTopic'
import { assistantService } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

import EmojiAvatar from './EmojiAvatar'

const logger = loggerService.withContext('Assistant Item')

interface AssistantItemProps {
  assistant: Assistant
  onAssistantPress: (assistant: Assistant) => void
}

const AssistantItem: FC<AssistantItemProps> = ({ assistant, onAssistantPress }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const toast = useToast()
  const { isDark } = useTheme()

  const handlePress = () => {
    onAssistantPress(assistant)
  }

  const handleDelete = async () => {
    try {
      const currentTopicId = getCurrentTopicId()
      const isTopicOwnedByAssistant = await topicService.isTopicOwnedByAssistant(assistant.id, currentTopicId)

      // If deleting current topic, create a new topic with default assistant first
      if (isTopicOwnedByAssistant) {
        const defaultAssistant = await assistantService.getAssistant('default')
        if (defaultAssistant) {
          const newTopic = await topicService.createTopic(defaultAssistant)
          await topicService.switchToTopic(newTopic.id)
          navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: newTopic.id } })
          logger.info('Created and switched to new topic before deletion')
        }
      }

      await topicService.deleteTopicsByAssistantId(assistant.id)
      await assistantService.deleteAssistant(assistant.id)
      toast.show(t('message.assistant_deleted'))
    } catch (error) {
      logger.error('Delete Assistant error', error)
    }
  }

  const contextMenuItems: ContextMenuListProps[] = [
    {
      title: t('common.delete'),
      iOSIcon: 'trash',
      androidIcon: <Trash2 size={16} className="text-red-100" />,
      destructive: true,
      color: 'red',
      onSelect: handleDelete
    }
  ]

  return (
    <ContextMenu borderRadius={16} list={contextMenuItems} onPress={handlePress}>
      <View className="bg-ui-card-background items-center justify-between rounded-2xl px-2.5 py-2.5">
        <XStack className="gap-3.5">
          <EmojiAvatar
            emoji={assistant.emoji}
            size={46}
            borderRadius={18}
            borderWidth={3}
            borderColor={isDark ? '#333333' : '#f7f7f7'}
          />
          <YStack className="flex-1 justify-center gap-1">
            <Text className="text-sm font-bold" numberOfLines={1} ellipsizeMode="tail">
              {assistant.name}
            </Text>
            {!isEmpty(assistant.prompt) && (
              <Text ellipsizeMode="tail" numberOfLines={1} className="text-text-secondary  text-xs">
                {assistant.prompt}
              </Text>
            )}
          </YStack>
        </XStack>
      </View>
    </ContextMenu>
  )
}

export default AssistantItem

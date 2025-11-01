import { useNavigation } from '@react-navigation/native'
import { isEmpty } from 'lodash'
import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Trash2 } from '@/componentsV2/icons/LucideIcon'
import { useTheme } from 'heroui-native'
import { useToast } from '@/hooks/useToast'
import { getCurrentTopicId } from '@/hooks/useTopic'
import { loggerService } from '@/services/LoggerService'
import { Assistant } from '@/types/assistant'
import { HomeNavigationProps } from '@/types/naviagate'
import EmojiAvatar from './EmojiAvatar'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import Text from '@/componentsV2/base/Text'
import ContextMenu, { ContextMenuListProps } from '@/componentsV2/base/ContextMenu'
import { assistantService } from '@/services/AssistantService'
import { topicService } from '@/services/TopicService'

const logger = loggerService.withContext('Assistant Item')

interface AssistantItemProps {
  assistant: Assistant
  onAssistantPress: (assistant: Assistant) => void
}

const AssistantItem: FC<AssistantItemProps> = ({ assistant, onAssistantPress }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<HomeNavigationProps>()
  const toast = useToast()
  const { isDark } = useTheme()

  const handlePress = () => {
    onAssistantPress(assistant)
  }

  const handleDelete = async () => {
    try {
      const isTopicOwnedByAssistant = await topicService.isTopicOwnedByAssistant(assistant.id, getCurrentTopicId())

      if (isTopicOwnedByAssistant) {
        navigation.navigate('ChatScreen', { topicId: 'new' })
      }

      await assistantService.deleteAssistant(assistant.id)
      await topicService.deleteTopicsByAssistantId(assistant.id)
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
      <View className="items-center justify-between rounded-2xl bg-ui-card-background px-2.5 py-2.5 dark:bg-ui-card-background-dark">
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
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                className="text-xs  text-text-secondary dark:text-text-secondary-dark">
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

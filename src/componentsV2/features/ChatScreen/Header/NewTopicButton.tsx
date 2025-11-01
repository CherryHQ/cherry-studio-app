import { messageDatabase } from '@database'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from 'heroui-native'
import { isEmpty } from 'lodash'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { SelectionSheet, Text, YStack } from '@/componentsV2'
import EmojiAvatar from '@/componentsV2/features/Assistant/EmojiAvatar'
import { MessageSquareDiff } from '@/componentsV2/icons/LucideIcon'
import { useExternalAssistants } from '@/hooks/useAssistant'
import { useCurrentTopic } from '@/hooks/useTopic'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface NewTopicButtonProps {
  assistant: Assistant
}

export const NewTopicButton: React.FC<NewTopicButtonProps> = ({ assistant }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<DrawerNavigationProps>()
  const { switchTopic } = useCurrentTopic()
  const { assistants, isLoading } = useExternalAssistants()

  const selectionSheetRef = useRef<BottomSheetModal | null>(null)
  const { isDark } = useTheme()

  const handleAddNewTopic = async (selectedAssistant?: Assistant) => {
    const targetAssistant = selectedAssistant || assistant

    // Check if the newest topic has messages
    const newestTopic = await topicService.getNewestTopic()
    const hasMessages = await messageDatabase.getHasMessagesWithTopicId(newestTopic?.id ?? '')

    if (hasMessages || !newestTopic) {
      // Create new topic (optimistic - UI updates immediately)
      const newTopic = await topicService.createTopic(targetAssistant)
      await switchTopic(newTopic.id)
      navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: newTopic.id } })
    } else {
      // Reuse the newest topic (update assistant if different)
      if (newestTopic.assistantId !== targetAssistant.id) {
        await topicService.updateTopic(newestTopic.id, {
          assistantId: targetAssistant.id
        })
      }
      await switchTopic(newestTopic.id)
      navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: newestTopic.id } })
    }
  }

  const openAssistantSelection = () => {
    selectionSheetRef.current?.present()
  }

  const closeBottomSheet = () => {
    selectionSheetRef.current?.dismiss()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSelectAssistant = (selectedAssistant: Assistant) => {
    closeBottomSheet()
    handleAddNewTopic(selectedAssistant)
  }

  const selectionItems = React.useMemo(() => {
    if (isLoading || !assistants.length) {
      return []
    }

    return assistants.map(assistantItem => ({
      key: assistantItem.id,
      label: (
        <YStack className="flex-1 justify-center gap-1">
          <Text className="text-sm font-bold" numberOfLines={1} ellipsizeMode="tail">
            {assistantItem.name}
          </Text>
          {!isEmpty(assistantItem.prompt) && (
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              className="text-xs  text-text-secondary dark:text-text-secondary-dark">
              {assistantItem.prompt}
            </Text>
          )}
        </YStack>
      ),
      icon: (
        <EmojiAvatar
          emoji={assistantItem.emoji}
          size={42}
          borderRadius={16}
          borderWidth={3}
          borderColor={isDark ? '#444444' : '#eeeeee'}
        />
      ),
      onSelect: () => handleSelectAssistant(assistantItem)
    }))
  }, [isLoading, assistants, isDark, handleSelectAssistant])

  return (
    <>
      <Pressable
        onPress={() => handleAddNewTopic()}
        onLongPress={openAssistantSelection}
        unstable_pressDelay={50}
        delayLongPress={150}
        className="active:opacity-20"
        disabled={isLoading}>
        <MessageSquareDiff size={24} />
      </Pressable>

      <SelectionSheet
        items={selectionItems}
        snapPoints={['40%', '90%']}
        ref={selectionSheetRef}
        placeholder={t('topics.select_assistant')}
      />
    </>
  )
}

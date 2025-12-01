import { messageDatabase } from '@database'
import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { Pressable } from 'react-native'

import { MessageSquareDiff } from '@/componentsV2/icons/LucideIcon'
import { useCurrentTopic } from '@/hooks/useTopic'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'
import type { DrawerNavigationProps } from '@/types/naviagate'

interface NewTopicButtonProps {
  assistant: Assistant
}

export const NewTopicButton: React.FC<NewTopicButtonProps> = ({ assistant }) => {
  const navigation = useNavigation<DrawerNavigationProps>()
  const { switchTopic } = useCurrentTopic()

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

  return (
    <Pressable onPress={() => handleAddNewTopic()} className="active:opacity-20">
      <MessageSquareDiff size={24} />
    </Pressable>
  )
}
